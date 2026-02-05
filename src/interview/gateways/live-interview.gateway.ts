import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveInterviewDeepgramService } from '../services/live-interview-deepgram.service';
import { LiveInterviewGeminiService } from '../services/live-interview-gemini.service';
import { LiveClient } from '@deepgram/sdk';

interface InterviewSession {
  interviewId: string;
  userId: string;
  deepgramConnection: LiveClient | null;
  deepgramConnectionOpen: boolean;
  audioChunkQueue: Buffer[]; // Queue for audio chunks until connection opens
  isReconnecting: boolean; // Flag to prevent multiple reconnection attempts
  reconnectAttempts: number; // Track reconnection attempts
  isDisconnecting: boolean; // Flag to prevent reconnection after client disconnect
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  currentQuestionIndex: number;
  interviewContext: {
    jobTitle: string;
    requiredSkills: string[];
    questions: Array<{ id: string; question: string; type: string; order: number }>;
  };
  isIntroductionComplete: boolean;
  isInterviewStarted: boolean;
  startedAt: Date; // Timestamp when interview started
  pendingTranscriptBuffer: string; // Accumulate final transcripts before sending to AI
  transcriptDebounceTimer?: NodeJS.Timeout; // Timer for debouncing transcript processing
  lastTranscriptTime: number; // Timestamp of last transcript received
  lastFollowUpSentTime: number; // Timestamp when last follow-up was sent (to prevent spam)
  followUpCount: number; // Count of follow-ups sent (to prevent infinite loop)
  lastInterimTranscript: string; // Last interim transcript received
  lastInterimTime: number; // Timestamp of last interim transcript
  interimStableTimer?: NodeJS.Timeout; // Timer to process stable interim transcripts
  askedQuestions: string[]; // Track asked questions to prevent duplicates
  isClosingSent: boolean; // Flag to prevent multiple closing messages
  isProcessingTranscript: boolean; // Lock to prevent concurrent transcript processing
  lastProcessedTranscript: string; // Track last processed transcript to avoid duplicates
  isGeneratingQuestion: boolean; // Lock to prevent concurrent question generation
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/live-interview',
})
export class LiveInterviewGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveInterviewGateway.name);
  private sessions = new Map<string, InterviewSession>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private deepgramService: LiveInterviewDeepgramService,
    private geminiService: LiveInterviewGeminiService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn('No token provided, disconnecting client');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub; // JWT uses 'sub' for user ID

      this.logger.log(`Client connected: ${client.id}, User ID: ${payload.sub}`);
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const sessionId = client.data.sessionId;
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.logger.log(`[Session ${sessionId}] Client disconnecting, cleaning up...`);
        
        // Mark session as disconnecting to prevent reconnection attempts
        session.isDisconnecting = true;
        session.isReconnecting = false; // Cancel any ongoing reconnection
        
        // Clear debounce timer if exists
        if (session.transcriptDebounceTimer) {
          clearTimeout(session.transcriptDebounceTimer);
          session.transcriptDebounceTimer = undefined;
        }
        
        // Clear interim stable timer if exists
        if (session.interimStableTimer) {
          clearTimeout(session.interimStableTimer);
          session.interimStableTimer = undefined;
        }
        
        if (session?.deepgramConnection) {
          this.logger.log(`[Session ${sessionId}] Closing Deepgram connection due to client disconnect`);
          this.deepgramService.closeConnection(session.deepgramConnection);
        }
        
        // Delete session after a short delay to allow close events to process
        // but mark it as disconnecting so reconnection won't happen
        setTimeout(() => {
          this.sessions.delete(sessionId);
          this.logger.log(`[Session ${sessionId}] Session cleaned up`);
        }, 1000); // 1 second delay to allow async close events
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-interview')
  async handleJoinInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      const interviewId = data.interviewId;

      // Load interview with template and job
      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          job: true,
          template: {
            include: {
              questions: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      });

      if (!interview) {
        client.emit('error', { message: 'Interview not found' });
        return;
      }

      if (!interview.template || !interview.template.questions.length) {
        client.emit('error', { message: 'Interview template not found or has no questions' });
        return;
      }

      // Create session
      const sessionId = `${interviewId}-${userId}`;
      client.data.sessionId = sessionId;

      const session: InterviewSession = {
        interviewId,
        userId,
        deepgramConnection: null,
        deepgramConnectionOpen: false,
        audioChunkQueue: [],
        isReconnecting: false,
        reconnectAttempts: 0,
        isDisconnecting: false,
        conversationHistory: [],
        currentQuestionIndex: 0,
        interviewContext: {
          jobTitle: interview.job.title,
          requiredSkills: interview.job.requiredSkills || [],
          questions: interview.template.questions.map(q => ({
            id: q.id,
            question: q.question,
            type: q.type,
            order: q.order,
          })),
        },
        isIntroductionComplete: false,
        isInterviewStarted: false,
        startedAt: new Date(), // Will be updated when interview actually starts
        pendingTranscriptBuffer: '',
        lastTranscriptTime: 0,
        lastFollowUpSentTime: 0,
        followUpCount: 0,
        lastInterimTranscript: '',
        lastInterimTime: 0,
        askedQuestions: [], // Track asked questions to prevent duplicates
        isClosingSent: false, // Flag to prevent multiple closing messages
        isProcessingTranscript: false, // Lock to prevent concurrent transcript processing
        lastProcessedTranscript: '', // Track last processed transcript to avoid duplicates
        isGeneratingQuestion: false, // Lock to prevent concurrent question generation
      };

      this.sessions.set(sessionId, session);
      client.join(interviewId);

      this.logger.log(`User ${userId} joined interview ${interviewId}`);

      // Notify client that interview is ready to start
      // Client should emit 'start-interview' when camera stream is loaded
      client.emit('interview-ready', {
        interviewId,
        jobTitle: interview.job.title,
        message: 'Interview ready. Waiting for camera stream...',
      });
    } catch (error: any) {
      this.logger.error('Error joining interview:', error);
      client.emit('error', { message: error.message || 'Failed to join interview' });
    }
  }

  @SubscribeMessage('start-interview')
  async handleStartInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    try {
      const sessionId = client.data.sessionId;
      const session = this.sessions.get(sessionId);

      if (!session) {
        client.emit('error', { message: 'Session not found' });
        return;
      }

      session.isInterviewStarted = true;
      session.startedAt = new Date(); // Track when interview actually starts
      this.logger.log(`[Session ${sessionId}] Interview started at ${session.startedAt.toISOString()}`);

      // Initialize Deepgram connection
      this.logger.log(`[Session ${sessionId}] Creating Deepgram connection...`);
      session.deepgramConnectionOpen = false;
      session.audioChunkQueue = []; // Initialize queue
      session.isReconnecting = false;
      session.reconnectAttempts = 0;
      
      const deepgramConnection = this.deepgramService.createLiveConnection(
        (text: string, isFinal: boolean) => {
          this.handleTranscript(sessionId, text, isFinal, client);
        },
        (error: Error) => {
          this.logger.error(`[Session ${sessionId}] Deepgram error:`, error);
          session.deepgramConnectionOpen = false;
          session.audioChunkQueue = []; // Clear queue on error
          client.emit('error', { message: 'Transcription error' });
        },
        () => {
          // onOpen callback - connection is now ready
          session.deepgramConnectionOpen = true;
          this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection is now open and ready`);
          
          // Notify frontend that Deepgram is ready to receive audio
          client.emit('deepgram-ready', { message: 'Deepgram connection is ready' });
          
          // Flush queued audio chunks (send in real-time intervals to avoid burst)
          if (session.audioChunkQueue.length > 0) {
            this.logger.log(`[Session ${sessionId}] Flushing ${session.audioChunkQueue.length} queued audio chunks...`);
            const queue = [...session.audioChunkQueue];
            session.audioChunkQueue = [];
            
            // Send chunks with small delays to maintain real-time flow
            // Each chunk is ~256ms of audio, so send them with ~250ms intervals
            queue.forEach((chunk, index) => {
              setTimeout(() => {
                try {
                  this.deepgramService.sendAudio(deepgramConnection, chunk);
                } catch (error) {
                  this.logger.error(`[Session ${sessionId}] Error sending queued chunk:`, error);
                }
              }, index * 250); // 250ms intervals to maintain real-time flow
            });
            this.logger.log(`[Session ${sessionId}] ✅ Queued chunks scheduled for sending`);
          }
        },
      );

      // Also track close event
      deepgramConnection.on('close', (event?: any) => {
        // Check if session still exists and is not disconnecting
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.isDisconnecting) {
          this.logger.debug(`[Session ${sessionId}] Deepgram connection closed but session is disconnecting or doesn't exist - skipping reconnection`);
          return; // Don't attempt reconnection if session is being cleaned up
        }
        
        currentSession.deepgramConnectionOpen = false;
        const queuedChunks = currentSession.audioChunkQueue.length;
        
        this.logger.warn(`[Session ${sessionId}] ⚠️ Deepgram connection closed`);
        if (event) {
          this.logger.warn(`[Session ${sessionId}] Close event:`, JSON.stringify(event, null, 2));
        }
        
        // Check if this is an unexpected close (not from end-interview or disconnect)
        if (currentSession.isInterviewStarted && !currentSession.isDisconnecting) {
          this.logger.warn(`[Session ${sessionId}] Deepgram connection closed during active interview`);
          
          // Check close code to determine if it's an error
          const isError = event?.code && event.code !== 1000; // 1000 = normal close
          
          if (isError && currentSession.reconnectAttempts < 3) {
            // Attempt automatic reconnection
            this.logger.log(`[Session ${sessionId}] Attempting to reconnect Deepgram (attempt ${currentSession.reconnectAttempts + 1}/3)...`);
            this.reconnectDeepgram(sessionId, client, queuedChunks);
          } else if (currentSession.reconnectAttempts >= 3) {
            this.logger.error(`[Session ${sessionId}] ❌ Max reconnection attempts reached. Connection cannot be restored.`);
            currentSession.audioChunkQueue = []; // Clear queue after max attempts
            if (client.connected) {
              client.emit('error', { message: 'Transcription connection lost after multiple reconnection attempts. Please refresh and try again.' });
            }
          } else {
            // Normal close or intentional disconnect
            currentSession.audioChunkQueue = []; // Clear queue on normal close
            if (queuedChunks > 0) {
              this.logger.warn(`[Session ${sessionId}] Lost ${queuedChunks} queued audio chunks due to connection close`);
            }
          }
        } else {
          // Interview not started yet or disconnecting, just clear queue
          if (currentSession) {
            currentSession.audioChunkQueue = [];
          }
        }
      });

      session.deepgramConnection = deepgramConnection;
      this.logger.log(`[Session ${sessionId}] Deepgram connection created, waiting for open event...`);

      // Check if connection opens after a delay (some SDK versions open asynchronously)
      // Note: Deepgram connections typically take 1-3 seconds to establish, which is normal
      setTimeout(() => {
        if (!session.deepgramConnectionOpen) {
          // This is informational - connection may still be establishing
          this.logger.debug(`[Session ${sessionId}] Deepgram connection still establishing after 2 seconds (this is normal)`);
          this.logger.debug(`[Session ${sessionId}] Queued chunks: ${session.audioChunkQueue.length} (will be sent when connection opens)`);
          
          // Try to check connection state - some SDKs might have a readyState property
          if (deepgramConnection && typeof (deepgramConnection as any).getReadyState === 'function') {
            const readyState = (deepgramConnection as any).getReadyState();
            // readyState: 0=CONNECTING (normal), 1=OPEN, 2=CLOSING, 3=CLOSED
            if (readyState === 0) {
              this.logger.debug(`[Session ${sessionId}] Connection state: CONNECTING (readyState: 0) - waiting...`);
            } else {
              this.logger.warn(`[Session ${sessionId}] Unexpected readyState: ${readyState}`);
            }
          }
        } else {
          this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection confirmed open`);
        }
      }, 2000);

      // Fallback: If connection still not open after 4 seconds, force it open and start sending
      // This handles cases where the open event doesn't fire but connection is actually ready
      setTimeout(() => {
        if (!session.deepgramConnectionOpen && session.audioChunkQueue.length > 0) {
          this.logger.warn(`[Session ${sessionId}] ⚠️ Connection still not open after 4 seconds with ${session.audioChunkQueue.length} queued chunks`);
          this.logger.warn(`[Session ${sessionId}] Forcing connection open (fallback mode) - connection may be ready but event didn't fire`);
          
          // Force connection to open state
          session.deepgramConnectionOpen = true;
          
          // Try sending a test chunk to see if connection is actually ready
          if (session.audioChunkQueue.length > 0) {
            const testChunk = session.audioChunkQueue[0];
            try {
              this.deepgramService.sendAudio(deepgramConnection, testChunk);
              this.logger.log(`[Session ${sessionId}] ✅ Test chunk sent successfully - connection appears to be working`);
              
              // Flush queue with real-time intervals
              const queue = [...session.audioChunkQueue];
              session.audioChunkQueue = [];
              
              queue.forEach((chunk, index) => {
                setTimeout(() => {
                  try {
                    this.deepgramService.sendAudio(deepgramConnection, chunk);
                  } catch (error) {
                    this.logger.error(`[Session ${sessionId}] Error sending queued chunk:`, error);
                  }
                }, index * 250);
              });
              this.logger.log(`[Session ${sessionId}] ✅ Queued chunks scheduled for sending (fallback mode)`);
            } catch (error) {
              this.logger.error(`[Session ${sessionId}] ❌ Failed to send test chunk - connection is not ready:`, error);
              session.deepgramConnectionOpen = false;
            }
          }
        }
      }, 4000);

      // Generate and send greeting
      const greeting = await this.geminiService.initializeInterview(session.interviewContext);
      
      session.conversationHistory.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      });

      const greetingTimestamp = new Date().toISOString();
      this.logger.log(`[Session ${sessionId}] 🤖 AI GREETING [${greetingTimestamp}]: "${greeting}"`);

      client.emit('ai-message', {
        message: greeting,
        type: 'greeting',
      });

      this.logger.log(`Interview started for session ${sessionId}`);
    } catch (error: any) {
      this.logger.error('Error starting interview:', error);
      client.emit('error', { message: error.message || 'Failed to start interview' });
    }
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; audio: ArrayBuffer },
  ) {
    const sessionId = client.data.sessionId;
    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        this.logger.warn(`[Session ${sessionId}] Audio chunk received but session not found`);
        return;
      }

      if (!session.deepgramConnection) {
        this.logger.warn(`[Session ${sessionId}] Audio chunk received but Deepgram connection not created. Interview started: ${session.isInterviewStarted}`);
        return;
      }

      // Get audio buffer
      const audioBuffer = Buffer.from(data.audio);
      
      // If connection is not open or we're reconnecting, queue the chunk
      if (!session.deepgramConnectionOpen || session.isReconnecting) {
        // Connection not open yet or reconnecting, queue the chunk
        session.audioChunkQueue.push(audioBuffer);
        
        // Log periodically to avoid spam (only log every 20th chunk or when queue gets large)
        if (session.audioChunkQueue.length % 20 === 0 || session.audioChunkQueue.length > 50) {
          const reason = session.isReconnecting ? 'reconnecting' : 'connection not open yet';
          this.logger.debug(`[Session ${sessionId}] Audio chunk queued (${reason}). Queue size: ${session.audioChunkQueue.length}`);
        }
        
        // Limit queue size to prevent memory issues (keep last 100 chunks)
        if (session.audioChunkQueue.length > 100) {
          session.audioChunkQueue.shift(); // Remove oldest chunk
          this.logger.warn(`[Session ${sessionId}] Audio queue limit reached, dropping oldest chunk`);
        }
        
        return;
      }

      // Connection is open, send audio to Deepgram
      try {
        this.deepgramService.sendAudio(session.deepgramConnection, audioBuffer);
        
        // Log periodically to avoid spam
        if (Math.random() < 0.05) { // Log ~5% of chunks
          this.logger.debug(`[Session ${sessionId}] ✅ Audio chunk sent to Deepgram: ${audioBuffer.length} bytes (PCM 16-bit)`);
        }
      } catch (error) {
        this.logger.error(`[Session ${sessionId}] ❌ Error sending audio to Deepgram:`, error);
      }
    } catch (error: any) {
      this.logger.error(`[Session ${sessionId || 'unknown'}] Error processing audio chunk:`, error);
    }
  }

  /**
   * Reconnect Deepgram connection when it closes unexpectedly
   */
  private reconnectDeepgram(sessionId: string, client: Socket, preservedQueueSize: number) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isReconnecting || session.isDisconnecting) {
      // Don't reconnect if session doesn't exist, is already reconnecting, or is disconnecting
      if (session?.isDisconnecting) {
        this.logger.debug(`[Session ${sessionId}] Skipping reconnection - session is disconnecting`);
      }
      return;
    }
    
    // Check if client is still connected
    if (!client.connected) {
      this.logger.debug(`[Session ${sessionId}] Skipping reconnection - client is disconnected`);
      return;
    }

    session.isReconnecting = true;
    session.reconnectAttempts++;
    
    this.logger.log(`[Session ${sessionId}] Reconnecting Deepgram (attempt ${session.reconnectAttempts})...`);
    
    // Wait a bit before reconnecting (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, session.reconnectAttempts - 1), 5000);
    
    setTimeout(async () => {
      try {
        // Create new Deepgram connection
        const deepgramConnection = this.deepgramService.createLiveConnection(
          (text: string, isFinal: boolean) => {
            this.handleTranscript(sessionId, text, isFinal, client);
          },
          (error: Error) => {
            this.logger.error(`[Session ${sessionId}] Deepgram reconnection error:`, error);
            session.deepgramConnectionOpen = false;
            session.isReconnecting = false;
            // Try again if we haven't exceeded max attempts
            if (session.reconnectAttempts < 3) {
              this.reconnectDeepgram(sessionId, client, session.audioChunkQueue.length);
            }
          },
          () => {
            // onOpen callback - reconnection successful
            session.deepgramConnectionOpen = true;
            session.isReconnecting = false;
            session.reconnectAttempts = 0; // Reset on successful reconnection
            this.logger.log(`[Session ${sessionId}] ✅ Deepgram reconnected successfully`);
            
            // Notify frontend
            client.emit('deepgram-ready', { message: 'Deepgram connection restored' });
            
            // Flush any queued chunks
            if (session.audioChunkQueue.length > 0) {
              this.logger.log(`[Session ${sessionId}] Flushing ${session.audioChunkQueue.length} queued chunks after reconnection...`);
              const queue = [...session.audioChunkQueue];
              session.audioChunkQueue = [];
              
              queue.forEach((chunk, index) => {
                setTimeout(() => {
                  try {
                    this.deepgramService.sendAudio(deepgramConnection, chunk);
                  } catch (error) {
                    this.logger.error(`[Session ${sessionId}] Error sending queued chunk after reconnect:`, error);
                  }
                }, index * 250);
              });
            }
          },
        );

        // Track close event for new connection
        deepgramConnection.on('close', (event?: any) => {
          const currentSession = this.sessions.get(sessionId);
          if (!currentSession || currentSession.isDisconnecting) {
            return; // Session is being cleaned up
          }
          
          currentSession.deepgramConnectionOpen = false;
          if (currentSession.isInterviewStarted && !currentSession.isDisconnecting && event?.code && event.code !== 1000) {
            // Unexpected close again - try reconnecting
            if (currentSession.reconnectAttempts < 3 && client.connected) {
              this.logger.warn(`[Session ${sessionId}] Reconnected connection closed again, attempting reconnection...`);
              this.reconnectDeepgram(sessionId, client, currentSession.audioChunkQueue.length);
            }
          }
        });

        session.deepgramConnection = deepgramConnection;
      } catch (error: any) {
        this.logger.error(`[Session ${sessionId}] Failed to reconnect Deepgram:`, error);
        session.isReconnecting = false;
        if (session.reconnectAttempts < 3) {
          // Retry after delay
          setTimeout(() => {
            this.reconnectDeepgram(sessionId, client, session.audioChunkQueue.length);
          }, 2000);
        } else {
          client.emit('error', { message: 'Failed to restore transcription connection. Please refresh.' });
        }
      }
    }, delay);
  }

  private async handleTranscript(
    sessionId: string,
    text: string,
    isFinal: boolean,
    client: Socket,
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[Session ${sessionId}] Transcript received but session not found`);
      return;
    }

    // Log all transcripts with clear formatting
    const timestamp = new Date().toISOString();
    if (isFinal) {
      this.logger.log(`[Session ${sessionId}] 📝 FINAL TRANSCRIPT [${timestamp}]: "${text}"`);
    } else {
      this.logger.log(`[Session ${sessionId}] 📝 INTERIM TRANSCRIPT [${timestamp}]: "${text}"`);
    }

    // Emit transcript to client (both interim and final) - for display purposes
    client.emit('transcript', {
      text,
      isFinal,
      timestamp: Date.now(),
      speaker: 'candidate',
    });

    // Handle interim transcripts - if they remain stable for a while, treat as final
    if (!isFinal && text.trim().length > 0) {
      const currentTime = Date.now();
      const textTrimmed = text.trim();
      const isSameAsLast = textTrimmed === session.lastInterimTranscript.trim();
      
      if (isSameAsLast && session.lastInterimTime > 0) {
        // Same interim transcript - check if it's been stable long enough
        const timeSinceLastInterim = currentTime - session.lastInterimTime;
        const INTERIM_STABLE_DELAY = 4000; // 4 seconds of stability
        
        if (timeSinceLastInterim >= INTERIM_STABLE_DELAY) {
          // Interim transcript has been stable for 4 seconds, treat it as final
          this.logger.log(`[Session ${sessionId}] 📝 Interim transcript stable for ${(timeSinceLastInterim / 1000).toFixed(1)}s, treating as final: "${textTrimmed}"`);
          
          // Clear interim timer
          if (session.interimStableTimer) {
            clearTimeout(session.interimStableTimer);
            session.interimStableTimer = undefined;
          }
          
          // Process as if it were a final transcript (reuse the final transcript logic below)
          // We'll set a flag to process this as final
          session.lastInterimTranscript = '';
          session.lastInterimTime = 0;
          
          // Process this interim as final by calling the final transcript handler logic
          // We'll accumulate and debounce it
          if (session.transcriptDebounceTimer) {
            clearTimeout(session.transcriptDebounceTimer);
            session.transcriptDebounceTimer = undefined;
          }

          // Accumulate in buffer
          if (session.pendingTranscriptBuffer) {
            session.pendingTranscriptBuffer += ' ' + textTrimmed;
          } else {
            session.pendingTranscriptBuffer = textTrimmed;
          }
          
          session.lastTranscriptTime = Date.now();
          this.logger.log(`[Session ${sessionId}] 📦 Accumulated transcript buffer (from stable interim): "${session.pendingTranscriptBuffer}"`);

          // Set debounce timer
          const DEBOUNCE_DELAY = 3000;
          session.transcriptDebounceTimer = setTimeout(async () => {
            const currentSession = this.sessions.get(sessionId);
            if (!currentSession || currentSession.isDisconnecting) {
              return;
            }

            const timeSinceLastTranscript = Date.now() - currentSession.lastTranscriptTime;
            if (timeSinceLastTranscript < DEBOUNCE_DELAY - 100) {
              this.logger.log(`[Session ${sessionId}] ⏳ Transcript received too recently, extending debounce`);
              return;
            }

            const completeTranscript = currentSession.pendingTranscriptBuffer.trim();
            if (completeTranscript.length === 0) {
              return;
            }

            const fillerPhrases = ['okay', 'ok', 'yes', 'no', 'uh', 'um', 'ah', 'sorry', 'thank you', 'thanks', 'hello', 'hi', 'hey'];
            const isFiller = completeTranscript.length < 10 || 
              fillerPhrases.some(phrase => completeTranscript.toLowerCase().trim() === phrase.toLowerCase().trim());
            
            if (isFiller) {
              this.logger.log(`[Session ${sessionId}] ⏭️ Skipping short/filler transcript: "${completeTranscript}"`);
              currentSession.pendingTranscriptBuffer = '';
              currentSession.transcriptDebounceTimer = undefined;
              return;
            }

            currentSession.pendingTranscriptBuffer = '';
            currentSession.transcriptDebounceTimer = undefined;

            this.logger.log(`[Session ${sessionId}] ✅ Processing complete transcript after debounce: "${completeTranscript}"`);
            await this.processCompleteTranscript(sessionId, completeTranscript, client);
          }, DEBOUNCE_DELAY);
          
          return; // Don't process as interim anymore
        }
      } else {
        // New or different interim transcript - reset tracking
        session.lastInterimTranscript = textTrimmed;
        session.lastInterimTime = currentTime;
        
        // Clear existing stable timer
        if (session.interimStableTimer) {
          clearTimeout(session.interimStableTimer);
        }
        
        // Set timer to check if this interim becomes stable
        const stableText = textTrimmed; // Capture for closure
        session.interimStableTimer = setTimeout(async () => {
          const currentSession = this.sessions.get(sessionId);
          if (!currentSession || currentSession.isDisconnecting) {
            return;
          }
          
          // Check if interim is still the same and enough time has passed
          const timeSinceLastInterim = Date.now() - currentSession.lastInterimTime;
          if (currentSession.lastInterimTranscript === stableText && timeSinceLastInterim >= 4000) {
            this.logger.log(`[Session ${sessionId}] 📝 Interim transcript stable after timer, treating as final: "${stableText}"`);
            
            // Clear the timer
            currentSession.interimStableTimer = undefined;
            currentSession.lastInterimTranscript = '';
            currentSession.lastInterimTime = 0;
            
            // Process as final transcript
            if (currentSession.transcriptDebounceTimer) {
              clearTimeout(currentSession.transcriptDebounceTimer);
              currentSession.transcriptDebounceTimer = undefined;
            }

            // Accumulate in buffer
            if (currentSession.pendingTranscriptBuffer) {
              currentSession.pendingTranscriptBuffer += ' ' + stableText;
            } else {
              currentSession.pendingTranscriptBuffer = stableText;
            }
            
            currentSession.lastTranscriptTime = Date.now();
            this.logger.log(`[Session ${sessionId}] 📦 Accumulated transcript buffer (from stable interim timer): "${currentSession.pendingTranscriptBuffer}"`);

            // Set debounce timer
            const DEBOUNCE_DELAY = 3000;
            currentSession.transcriptDebounceTimer = setTimeout(async () => {
              const finalSession = this.sessions.get(sessionId);
              if (!finalSession || finalSession.isDisconnecting) {
                return;
              }

              const timeSinceLastTranscript = Date.now() - finalSession.lastTranscriptTime;
              if (timeSinceLastTranscript < DEBOUNCE_DELAY - 100) {
                this.logger.log(`[Session ${sessionId}] ⏳ Transcript received too recently, extending debounce`);
                return;
              }

              const completeTranscript = finalSession.pendingTranscriptBuffer.trim();
              if (completeTranscript.length === 0) {
                return;
              }

              const fillerPhrases = ['okay', 'ok', 'yes', 'no', 'uh', 'um', 'ah', 'sorry', 'thank you', 'thanks', 'hello', 'hi', 'hey'];
              const isFiller = completeTranscript.length < 10 || 
                fillerPhrases.some(phrase => completeTranscript.toLowerCase().trim() === phrase.toLowerCase().trim());
              
              if (isFiller) {
                this.logger.log(`[Session ${sessionId}] ⏭️ Skipping short/filler transcript: "${completeTranscript}"`);
                finalSession.pendingTranscriptBuffer = '';
                finalSession.transcriptDebounceTimer = undefined;
                return;
              }

              finalSession.pendingTranscriptBuffer = '';
              finalSession.transcriptDebounceTimer = undefined;

              this.logger.log(`[Session ${sessionId}] ✅ Processing complete transcript after debounce: "${completeTranscript}"`);
              await this.processCompleteTranscript(sessionId, completeTranscript, client);
            }, DEBOUNCE_DELAY);
          }
        }, 4000);
      }
    } else if (isFinal) {
      // Clear interim tracking when we get a final transcript
      session.lastInterimTranscript = '';
      session.lastInterimTime = 0;
      if (session.interimStableTimer) {
        clearTimeout(session.interimStableTimer);
        session.interimStableTimer = undefined;
      }
    }

    // Process final transcripts for AI response with debouncing
    if (isFinal && text.trim().length > 0) {
      // Clear any existing debounce timer
      if (session.transcriptDebounceTimer) {
        this.logger.log(`[Session ${sessionId}] 🧹 Clearing existing debounce timer before setting new one`);
        clearTimeout(session.transcriptDebounceTimer);
        session.transcriptDebounceTimer = undefined;
      }

      // Accumulate final transcripts (add space if buffer already has content)
      if (session.pendingTranscriptBuffer) {
        session.pendingTranscriptBuffer += ' ' + text.trim();
      } else {
        session.pendingTranscriptBuffer = text.trim();
      }
      
      session.lastTranscriptTime = Date.now();
      this.logger.log(`[Session ${sessionId}] 📦 Accumulated transcript buffer: "${session.pendingTranscriptBuffer}"`);

      // Set debounce timer: wait 6 seconds after last final transcript before processing
      // This allows user to finish their complete thought and ensures we capture all transcripts
      const DEBOUNCE_DELAY = 6000; // 6 seconds - longer delay to accumulate complete response
      
      // Store the buffer content at the time the timer is set (to detect if it changed)
      const bufferSnapshot = session.pendingTranscriptBuffer;
      const bufferSnapshotTime = Date.now();
      
      session.transcriptDebounceTimer = setTimeout(async () => {
        // Check if session still exists and hasn't been cleared
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.isDisconnecting) {
          return;
        }

        // Check if buffer was already cleared (another timer might have processed it)
        if (!currentSession.pendingTranscriptBuffer || currentSession.pendingTranscriptBuffer.trim().length === 0) {
          this.logger.log(`[Session ${sessionId}] ⏭️ Buffer already cleared, skipping duplicate timer`);
          currentSession.transcriptDebounceTimer = undefined;
          return;
        }

        // Check if buffer content changed (new transcripts came in after timer was set)
        // If buffer changed significantly, this timer is for old content - skip it
        const currentBuffer = currentSession.pendingTranscriptBuffer.trim();
        const snapshotBuffer = bufferSnapshot.trim();
        if (currentBuffer !== snapshotBuffer && currentBuffer.length > snapshotBuffer.length) {
          // Buffer has new content, let a newer timer handle it
          this.logger.log(`[Session ${sessionId}] ⏭️ Buffer updated since timer was set, skipping old timer`);
          return;
        }

        // Check if enough time has passed since last transcript (prevent race conditions)
        const timeSinceLastTranscript = Date.now() - currentSession.lastTranscriptTime;
        if (timeSinceLastTranscript < DEBOUNCE_DELAY - 100) {
          // Too soon, reset timer
          this.logger.log(`[Session ${sessionId}] ⏳ Transcript received too recently, extending debounce`);
          return;
        }

        const completeTranscript = currentSession.pendingTranscriptBuffer.trim();
        if (completeTranscript.length === 0) {
          return;
        }

        // Skip very short transcripts that are likely incomplete (less than 10 characters)
        // Also skip common filler words/phrases
        const fillerPhrases = ['okay', 'ok', 'yes', 'no', 'uh', 'um', 'ah', 'sorry', 'thank you', 'thanks'];
        const isFiller = completeTranscript.length < 10 || 
          fillerPhrases.some(phrase => completeTranscript.toLowerCase().trim() === phrase.toLowerCase().trim());
        
        if (isFiller) {
          this.logger.log(`[Session ${sessionId}] ⏭️ Skipping short/filler transcript: "${completeTranscript}"`);
          currentSession.pendingTranscriptBuffer = '';
          currentSession.transcriptDebounceTimer = undefined;
          return;
        }

        // Check if we're already processing a transcript (prevent concurrent processing)
        if (currentSession.isProcessingTranscript) {
          this.logger.warn(`[Session ${sessionId}] ⚠️ Already processing a transcript, skipping duplicate: "${completeTranscript}"`);
          // Don't clear buffer - let it be processed later
          return;
        }
        
        // Check if this transcript was already processed (prevent duplicate processing)
        // Use a more lenient comparison (normalize whitespace and case)
        const normalizedTranscript = completeTranscript.trim().toLowerCase().replace(/\s+/g, ' ');
        const normalizedLastProcessed = currentSession.lastProcessedTranscript.trim().toLowerCase().replace(/\s+/g, ' ');
        
        if (normalizedLastProcessed && normalizedTranscript === normalizedLastProcessed) {
          this.logger.warn(`[Session ${sessionId}] ⚠️ Transcript already processed, skipping duplicate: "${completeTranscript}"`);
          currentSession.pendingTranscriptBuffer = '';
          currentSession.transcriptDebounceTimer = undefined;
          return;
        }
        
        // Check if this transcript is very similar to the last processed one (fuzzy match)
        // This handles cases where Deepgram sends slightly different versions of the same transcript
        if (normalizedLastProcessed && normalizedTranscript.length > 20) {
          // Calculate similarity (simple Levenshtein-like check)
          const similarity = this.calculateSimilarity(normalizedTranscript, normalizedLastProcessed);
          if (similarity > 0.9) { // 90% similar
            this.logger.warn(`[Session ${sessionId}] ⚠️ Transcript too similar to last processed (${(similarity * 100).toFixed(1)}%), skipping: "${completeTranscript}"`);
            currentSession.pendingTranscriptBuffer = '';
            currentSession.transcriptDebounceTimer = undefined;
            return;
          }
        }

        // Clear the buffer and timer BEFORE processing (to prevent re-processing)
        currentSession.pendingTranscriptBuffer = '';
        currentSession.transcriptDebounceTimer = undefined;
        
        this.logger.log(`[Session ${sessionId}] ✅ Processing complete transcript after debounce: "${completeTranscript}"`);
        this.logger.log(`[Session ${sessionId}] Introduction complete: ${currentSession.isIntroductionComplete}, Question index: ${currentSession.currentQuestionIndex}`);
        this.logger.log(`[Session ${sessionId}] 🔒 Processing lock status: ${currentSession.isProcessingTranscript}, Generating question: ${currentSession.isGeneratingQuestion}`);
        
        // Process the accumulated transcript
        await this.processCompleteTranscript(sessionId, completeTranscript, client);
        
        this.logger.log(`[Session ${sessionId}] ✅ Finished processing transcript`);
      }, DEBOUNCE_DELAY);
    }
  }

  /**
   * Calculate similarity between two strings (simple Levenshtein distance-based)
   * Returns a value between 0 and 1, where 1 is identical
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
    // Simple similarity: check how many words match
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const totalWords = Math.max(words1.length, words2.length);
    
    if (totalWords === 0) return 1;
    
    // Count matching words (order-independent)
    let matches = 0;
    const words2Set = new Set(words2);
    for (const word of words1) {
      if (words2Set.has(word)) {
        matches++;
      }
    }
    
    // Also check character-level similarity for short strings
    let charMatches = 0;
    const minLength = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLength; i++) {
      if (str1[i] === str2[i]) {
        charMatches++;
      }
    }
    
    // Combine word and character similarity
    const wordSimilarity = matches / totalWords;
    const charSimilarity = minLength > 0 ? charMatches / Math.max(str1.length, str2.length) : 0;
    
    return (wordSimilarity * 0.7 + charSimilarity * 0.3);
  }

  private async processCompleteTranscript(
    sessionId: string,
    text: string,
    client: Socket,
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[Session ${sessionId}] Cannot process transcript - session not found`);
      return;
    }
    
    // Set processing lock to prevent concurrent processing
    if (session.isProcessingTranscript) {
      this.logger.warn(`[Session ${sessionId}] ⚠️ Already processing transcript, skipping: "${text}"`);
      return;
    }
    
    session.isProcessingTranscript = true;
    // Set last processed transcript (normalized for comparison)
    session.lastProcessedTranscript = text.trim().toLowerCase().replace(/\s+/g, ' ');
    
    try {
      // Check if this transcript was already added to conversation history
      // Use normalized comparison to catch duplicates with different whitespace
      const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ');
      const alreadyAdded = session.conversationHistory.some(
        msg => {
          if (msg.role !== 'user') return false;
          const normalizedMsg = msg.content.trim().toLowerCase().replace(/\s+/g, ' ');
          return normalizedMsg === normalizedText || this.calculateSimilarity(normalizedMsg, normalizedText) > 0.9;
        }
      );
      
      if (alreadyAdded) {
        this.logger.warn(`[Session ${sessionId}] ⚠️ Transcript already in conversation history, skipping: "${text}"`);
        session.isProcessingTranscript = false;
        return;
      }
      
      // Add to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date(),
      });

    // Check if introduction is complete
    if (!session.isIntroductionComplete) {
      // Check if user has given a proper introduction (more than just name)
      // Look for keywords that indicate a proper introduction
      const introKeywords = ['experience', 'worked', 'work', 'background', 'years', 'skills', 'developer', 'engineer', 'engineered', 'studied', 'degree', 'project', 'developed', 'development', 'node', 'js', 'javascript', 'typescript', 'python', 'java', 'react', 'angular', 'vue', 'backend', 'frontend', 'full stack', 'fullstack'];
      const textLower = text.toLowerCase();
      const hasIntroContent = text.length > 30 || introKeywords.some(keyword => textLower.includes(keyword));
      
      if (hasIntroContent) {
          this.logger.log(`[Session ${sessionId}] Introduction detected, asking follow-up question`);
          session.isIntroductionComplete = true;
          
          try {
            // Ask one question related to introduction
            const introQuestion = await this.geminiService.generateResponse(
              session.interviewContext,
              session.conversationHistory,
              session.currentQuestionIndex,
            );

            const timestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI QUESTION [${timestamp}]: "${introQuestion}"`);

            session.conversationHistory.push({
              role: 'assistant',
              content: introQuestion,
              timestamp: new Date(),
            });

            client.emit('ai-message', {
              message: introQuestion,
              type: 'question',
            });

            session.currentQuestionIndex++;
            this.logger.log(`[Session ${sessionId}] Question index incremented to: ${session.currentQuestionIndex}`);
          } catch (error: any) {
            this.logger.error(`[Session ${sessionId}] Error generating intro follow-up:`, error);
            // Fallback question
            const fallbackQuestion = "That's interesting! Can you tell me more about your experience?";
            
            session.conversationHistory.push({
              role: 'assistant',
              content: fallbackQuestion,
              timestamp: new Date(),
            });

            const fallbackTimestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI FALLBACK QUESTION [${fallbackTimestamp}]: "${fallbackQuestion}"`);

            client.emit('ai-message', {
              message: fallbackQuestion,
              type: 'question',
            });

            session.currentQuestionIndex++;
          }
        } else {
          // Prevent spamming the same follow-up question
          const timeSinceLastFollowUp = Date.now() - session.lastFollowUpSentTime;
          const MIN_FOLLOWUP_INTERVAL = 10000; // 10 seconds between follow-ups
          const MAX_FOLLOWUPS = 3; // Maximum 3 follow-ups before forcing intro complete
          
          if (session.followUpCount >= MAX_FOLLOWUPS) {
            // Force introduction complete after max follow-ups to prevent infinite loop
            this.logger.log(`[Session ${sessionId}] Max follow-ups reached (${session.followUpCount}), marking introduction as complete`);
            session.isIntroductionComplete = true;
            // Continue with interview questions
            await this.continueWithInterviewQuestions(sessionId, client);
          } else if (timeSinceLastFollowUp >= MIN_FOLLOWUP_INTERVAL) {
            // Prompt for more details (only if enough time has passed)
            const prompt = "Nice to meet you! Could you tell me a bit more about your background and experience?";
            
            session.conversationHistory.push({
              role: 'assistant',
              content: prompt,
              timestamp: new Date(),
            });

            session.lastFollowUpSentTime = Date.now();
            session.followUpCount++;

            const followUpTimestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI FOLLOW-UP [${followUpTimestamp}] (${session.followUpCount}/${MAX_FOLLOWUPS}): "${prompt}"`);

            client.emit('ai-message', {
              message: prompt,
              type: 'follow-up',
            });
          } else {
            this.logger.log(`[Session ${sessionId}] ⏭️ Skipping follow-up - too soon since last one (${(timeSinceLastFollowUp / 1000).toFixed(1)}s ago)`);
          }
        }
    } else {
      // Continue with interview questions
      await this.continueWithInterviewQuestions(sessionId, client);
    }
    
    // Release processing lock
    session.isProcessingTranscript = false;
    } catch (error: any) {
      // Release processing lock on error
      if (session) {
        session.isProcessingTranscript = false;
      }
      this.logger.error(`[Session ${sessionId}] Error processing transcript:`, error);
    }
  }

  private async continueWithInterviewQuestions(sessionId: string, client: Socket) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`[Session ${sessionId}] Cannot continue interview - session not found`);
      return;
    }
    
    // Prevent concurrent question generation
    if (session.isGeneratingQuestion) {
      this.logger.warn(`[Session ${sessionId}] ⚠️ Already generating question, skipping duplicate call`);
      return;
    }
    
    session.isGeneratingQuestion = true;
    
    try {

    this.logger.log(`[Session ${sessionId}] Introduction complete, continuing with questions. Current index: ${session.currentQuestionIndex}`);
    
    // Check if we should end interview (includes minimum duration check)
    const shouldEnd = this.geminiService.shouldEndInterview(
      session.currentQuestionIndex,
      session.interviewContext.questions.length,
      session.conversationHistory.length,
      session.startedAt,
    );
    
    // Calculate elapsed time for logging
    const elapsedTime = Date.now() - session.startedAt.getTime();
    const elapsedMinutes = elapsedTime / (60 * 1000);
    
    this.logger.log(
      `[Session ${sessionId}] Should end interview: ${shouldEnd} ` +
      `(Duration: ${elapsedMinutes.toFixed(1)} minutes, ` +
      `Questions: ${session.currentQuestionIndex}/${session.interviewContext.questions.length}, ` +
      `Conversation: ${session.conversationHistory.length} messages)`
    );
    
    if (shouldEnd) {
      // Prevent multiple closing messages
      if (session.isClosingSent) {
        this.logger.log(`[Session ${sessionId}] Closing already sent, skipping...`);
        session.isGeneratingQuestion = false;
        return;
      }
      
      session.isClosingSent = true;
      
      // End interview
      const closing = await this.geminiService.generateClosing();
      
      session.conversationHistory.push({
        role: 'assistant',
        content: closing,
        timestamp: new Date(),
      });

      const closingTimestamp = new Date().toISOString();
      this.logger.log(`[Session ${sessionId}] 🤖 AI CLOSING [${closingTimestamp}]: "${closing}"`);

      client.emit('ai-message', {
        message: closing,
        type: 'closing',
      });

      // Wait a moment before ending to ensure message is sent
      setTimeout(() => {
        client.emit('interview-ended', {
          message: 'Interview completed',
        });

        // Cleanup
        if (session.transcriptDebounceTimer) {
          clearTimeout(session.transcriptDebounceTimer);
        }
        if (session.deepgramConnection) {
          this.deepgramService.closeConnection(session.deepgramConnection);
        }
        this.sessions.delete(sessionId);
      }, 1000);
    } else {
      // Generate next response
      try {
        // Check if template questions are exhausted
        const templateQuestionsExhausted = session.currentQuestionIndex >= session.interviewContext.questions.length;
        
        if (templateQuestionsExhausted) {
          this.logger.log(`[Session ${sessionId}] All template questions exhausted, generating follow-up question`);
          
          // Generate follow-up question based on job requirements and conversation
          const response = await this.geminiService.generateFollowUpQuestion(
            session.interviewContext,
            session.conversationHistory,
            session.askedQuestions,
          );

          // Check if this question was already asked (prevent duplicates)
          const responseLower = response.toLowerCase().trim();
          const isDuplicate = session.askedQuestions.some(
            asked => asked.toLowerCase().trim() === responseLower
          );
          
          if (isDuplicate) {
            this.logger.warn(`[Session ${sessionId}] ⚠️ Duplicate follow-up question detected, generating alternative...`);
            
            // Generate alternative question with different approach
            const alternativeResponse = await this.geminiService.generateFollowUpQuestion(
              session.interviewContext,
              session.conversationHistory,
              session.askedQuestions,
            );
            
            session.conversationHistory.push({
              role: 'assistant',
              content: alternativeResponse,
              timestamp: new Date(),
            });

            const timestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI FOLLOW-UP QUESTION (alternative) [${timestamp}]: "${alternativeResponse}"`);

            client.emit('ai-message', {
              message: alternativeResponse,
              type: 'question',
            });

            session.askedQuestions.push(alternativeResponse);
          } else {
            const timestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI FOLLOW-UP QUESTION [${timestamp}]: "${response}"`);

            session.conversationHistory.push({
              role: 'assistant',
              content: response,
              timestamp: new Date(),
            });

            client.emit('ai-message', {
              message: response,
              type: 'question',
            });

            session.askedQuestions.push(response);
          }
        } else {
          // Still have template questions - use them
          this.logger.log(`[Session ${sessionId}] Generating next question from template (index: ${session.currentQuestionIndex})`);
          
          const response = await this.geminiService.generateResponse(
            session.interviewContext,
            session.conversationHistory,
            session.currentQuestionIndex,
          );

          // Check if this question was already asked (prevent duplicates)
          const responseLower = response.toLowerCase().trim();
          const isDuplicate = session.askedQuestions.some(
            asked => asked.toLowerCase().trim() === responseLower
          );
          
          if (isDuplicate) {
            this.logger.warn(`[Session ${sessionId}] ⚠️ Duplicate question detected, generating follow-up instead...`);
            
            // Generate follow-up question instead of repeating
            const alternativeResponse = await this.geminiService.generateFollowUpQuestion(
              session.interviewContext,
              session.conversationHistory,
              session.askedQuestions,
            );
            
            session.conversationHistory.push({
              role: 'assistant',
              content: alternativeResponse,
              timestamp: new Date(),
            });

            const timestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI QUESTION (follow-up instead) [${timestamp}]: "${alternativeResponse}"`);

            client.emit('ai-message', {
              message: alternativeResponse,
              type: 'question',
            });

            session.askedQuestions.push(alternativeResponse);
            
            // Still increment to move past the duplicate template question
            session.currentQuestionIndex++;
          } else {
            const timestamp = new Date().toISOString();
            this.logger.log(`[Session ${sessionId}] 🤖 AI QUESTION [${timestamp}]: "${response}"`);

            session.conversationHistory.push({
              role: 'assistant',
              content: response,
              timestamp: new Date(),
            });

            client.emit('ai-message', {
              message: response,
              type: 'question',
            });

            session.askedQuestions.push(response);
            session.currentQuestionIndex++;
            this.logger.log(`[Session ${sessionId}] Question index incremented to: ${session.currentQuestionIndex}`);
          }
        }
      } catch (error: any) {
        this.logger.error(`[Session ${sessionId}] Error generating next question:`, error);
        // Fallback: ask a generic question
        const fallbackQuestion = session.interviewContext.questions[session.currentQuestionIndex]?.question || 
          "Could you tell me more about that?";
        
        session.conversationHistory.push({
          role: 'assistant',
          content: fallbackQuestion,
          timestamp: new Date(),
        });

        const fallbackTimestamp2 = new Date().toISOString();
        this.logger.log(`[Session ${sessionId}] 🤖 AI FALLBACK QUESTION [${fallbackTimestamp2}]: "${fallbackQuestion}"`);

        client.emit('ai-message', {
          message: fallbackQuestion,
          type: 'question',
        });

        session.currentQuestionIndex++;
      }
    }
    } finally {
      // Always release the lock, even if an error occurred
      if (session) {
        session.isGeneratingQuestion = false;
      }
    }
  }

  @SubscribeMessage('end-interview')
  async handleEndInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    try {
      const sessionId = client.data.sessionId;
      const session = this.sessions.get(sessionId);

      if (session) {
        // Mark as disconnecting to prevent reconnection attempts
        session.isDisconnecting = true;
        session.isReconnecting = false;
        
        // Clear debounce timer if exists
        if (session.transcriptDebounceTimer) {
          clearTimeout(session.transcriptDebounceTimer);
          session.transcriptDebounceTimer = undefined;
        }
        
        // Close Deepgram connection
        if (session.deepgramConnection) {
          this.deepgramService.closeConnection(session.deepgramConnection);
        }

        // Save conversation history to database
        // TODO: Save conversation history

        // Cleanup
        this.sessions.delete(sessionId);
        this.logger.log(`Interview ended for session ${sessionId}`);
      }

      client.emit('interview-ended', {
        message: 'Interview ended by user',
      });
    } catch (error: any) {
      this.logger.error('Error ending interview:', error);
      client.emit('error', { message: error.message || 'Failed to end interview' });
    }
  }
}
