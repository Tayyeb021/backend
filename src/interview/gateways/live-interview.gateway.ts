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

    // Emit transcript to client (both interim and final)
    client.emit('transcript', {
      text,
      isFinal,
      timestamp: Date.now(),
      speaker: 'candidate',
    });

    // Only process final transcripts for AI response
    if (isFinal && text.trim().length > 0) {
      this.logger.log(`[Session ${sessionId}] ✅ Processing final transcript for AI response: "${text}"`);
      this.logger.log(`[Session ${sessionId}] Introduction complete: ${session.isIntroductionComplete}, Question index: ${session.currentQuestionIndex}`);
      
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
        const introKeywords = ['experience', 'worked', 'background', 'years', 'skills', 'developer', 'engineer', 'studied', 'degree', 'project'];
        const hasIntroContent = text.length > 50 || introKeywords.some(keyword => text.toLowerCase().includes(keyword));
        
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
          // Prompt for more details
          const prompt = "Nice to meet you! Could you tell me a bit more about your background and experience?";
          
          session.conversationHistory.push({
            role: 'assistant',
            content: prompt,
            timestamp: new Date(),
          });

          const followUpTimestamp = new Date().toISOString();
          this.logger.log(`[Session ${sessionId}] 🤖 AI FOLLOW-UP [${followUpTimestamp}]: "${prompt}"`);

          client.emit('ai-message', {
            message: prompt,
            type: 'follow-up',
          });
        }
      } else {
        // Continue with interview questions
        this.logger.log(`[Session ${sessionId}] Introduction complete, continuing with questions. Current index: ${session.currentQuestionIndex}`);
        
        // Check if we should end interview
        const shouldEnd = this.geminiService.shouldEndInterview(
          session.currentQuestionIndex,
          session.interviewContext.questions.length,
          session.conversationHistory.length,
        );
        
        this.logger.log(`[Session ${sessionId}] Should end interview: ${shouldEnd}`);
        
        if (shouldEnd) {
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

          client.emit('interview-ended', {
            message: 'Interview completed',
          });

          // Cleanup
          if (session.deepgramConnection) {
            this.deepgramService.closeConnection(session.deepgramConnection);
          }
          this.sessions.delete(sessionId);
        } else {
          // Generate next response
          try {
            this.logger.log(`[Session ${sessionId}] Generating next question (index: ${session.currentQuestionIndex})`);
            
            const response = await this.geminiService.generateResponse(
              session.interviewContext,
              session.conversationHistory,
              session.currentQuestionIndex,
            );

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

            session.currentQuestionIndex++;
            this.logger.log(`[Session ${sessionId}] Question index incremented to: ${session.currentQuestionIndex}`);
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
