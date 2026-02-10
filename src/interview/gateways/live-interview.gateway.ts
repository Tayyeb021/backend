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
import { InterviewTempStorageService } from '../services/interview-temp-storage.service';
import { LiveClient } from '@deepgram/sdk';
import { InterviewStatus } from '@prisma/client';

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
  preGeneratedGreeting?: string; // Pre-generated greeting to reduce start delay
  durationCheckTimer?: NodeJS.Timeout; // Timer to check if 5 minutes have passed and end interview gracefully
  keepaliveInterval?: NodeJS.Timeout; // Keepalive interval to prevent Deepgram connection timeout
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
  // Temporary storage for audio chunks keyed by interviewId (for fallback when session is lost)
  private audioChunkStorage = new Map<string, { chunks: Buffer[]; lastUpdated: number }>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private deepgramService: LiveInterviewDeepgramService,
    private geminiService: LiveInterviewGeminiService,
    private tempStorageService: InterviewTempStorageService,
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
        
        // Clear duration check timer if exists
        if (session.durationCheckTimer) {
          clearTimeout(session.durationCheckTimer);
          session.durationCheckTimer = undefined;
        }
        
        // Clear keepalive interval if exists
        if (session.keepaliveInterval) {
          clearInterval(session.keepaliveInterval);
          session.keepaliveInterval = undefined;
          this.logger.log(`[Session ${sessionId}] Keepalive interval cleared`);
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

      // CRITICAL: Create Deepgram connection IMMEDIATELY when user joins
      // This ensures Deepgram is ready BEFORE the interview starts
      this.logger.log(`[Session ${sessionId}] Creating Deepgram connection during join-interview...`);
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
          
          // Notify frontend that Deepgram is ready
          client.emit('deepgram-ready', { message: 'Deepgram connection is ready' });
          
          // Flush queued audio chunks if any (shouldn't be any at this point)
          const queuedChunks = session.audioChunkQueue.length;
          if (queuedChunks > 0) {
            this.logger.log(`[Session ${sessionId}] Flushing ${queuedChunks} queued audio chunks...`);
            const queue = [...session.audioChunkQueue];
            session.audioChunkQueue = [];
            
            queue.forEach((chunk, index) => {
              setTimeout(() => {
                try {
                  this.deepgramService.sendAudio(deepgramConnection, chunk);
                } catch (error) {
                  this.logger.error(`[Session ${sessionId}] Error sending queued chunk:`, error);
                }
              }, index * 100);
            });
          }
          
          // NOW notify client that interview is ready to start (Deepgram is confirmed ready)
          // Client should emit 'start-interview' when camera stream is loaded
          client.emit('interview-ready', {
            interviewId,
            jobTitle: interview.job.title,
            message: 'Interview ready. Deepgram connection established. Waiting for camera stream...',
          });
          
          // CRITICAL: Set up keepalive to prevent Deepgram connection timeout
          // Deepgram closes connections after ~12 seconds of inactivity
          // Send silence packets every 5 seconds to keep connection alive
          const keepaliveInterval = setInterval(() => {
            const currentSession = this.sessions.get(sessionId);
            if (!currentSession || !currentSession.deepgramConnection || currentSession.isDisconnecting) {
              clearInterval(keepaliveInterval);
              return;
            }
            
            // Check if connection is still open
            if (currentSession.deepgramConnection.getReadyState() !== 1) {
              this.logger.warn(`[Session ${sessionId}] Deepgram connection not open, stopping keepalive`);
              clearInterval(keepaliveInterval);
              currentSession.keepaliveInterval = undefined;
              return;
            }
            
            // Send a small silence packet (320 bytes = 10ms of 16kHz 16-bit mono audio)
            // This keeps the connection alive without affecting transcription
            const silenceDuration = 0.01; // 10ms
            const sampleRate = 16000;
            const samples = Math.floor(sampleRate * silenceDuration);
            const silenceBuffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
            silenceBuffer.fill(0); // Fill with silence (zero)
            
            try {
              this.deepgramService.sendAudio(currentSession.deepgramConnection, silenceBuffer, true);
            } catch (error) {
              this.logger.error(`[Session ${sessionId}] Error sending keepalive:`, error);
              clearInterval(keepaliveInterval);
              currentSession.keepaliveInterval = undefined;
            }
          }, 5000); // Send every 5 seconds
          
          // Store interval ID to clear it on disconnect
          session.keepaliveInterval = keepaliveInterval;
          this.logger.log(`[Session ${sessionId}] ✅ Keepalive interval started (every 5 seconds)`);
        },
      );

      // Track close event
      deepgramConnection.on('close', (event?: any) => {
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.isDisconnecting) {
          return;
        }
        
        currentSession.deepgramConnectionOpen = false;
        this.logger.warn(`[Session ${sessionId}] ⚠️ Deepgram connection closed`);
        
        if (currentSession.isInterviewStarted && !currentSession.isDisconnecting) {
          const isError = event?.code && event.code !== 1000;
          if (isError && currentSession.reconnectAttempts < 3) {
            this.logger.log(`[Session ${sessionId}] Attempting to reconnect Deepgram (attempt ${currentSession.reconnectAttempts + 1}/3)...`);
            this.reconnectDeepgram(sessionId, client, currentSession.audioChunkQueue.length);
          }
        }
      });

      session.deepgramConnection = deepgramConnection;
      this.logger.log(`[Session ${sessionId}] Deepgram connection created, waiting for open event before emitting interview-ready...`);

      // Pre-generate greeting in parallel to reduce start delay
      // This way the greeting is ready when 'start-interview' is called
      this.geminiService.initializeInterview(session.interviewContext)
        .then((greeting) => {
          const currentSession = this.sessions.get(sessionId);
          if (currentSession && !currentSession.isInterviewStarted) {
            currentSession.preGeneratedGreeting = greeting;
            this.logger.log(`[Session ${sessionId}] ✅ Greeting pre-generated: "${greeting.substring(0, 50)}..."`);
          }
        })
        .catch((error) => {
          this.logger.error(`[Session ${sessionId}] Failed to pre-generate greeting:`, error);
          // Don't fail the join - greeting will be generated on start-interview as fallback
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

      // CRITICAL: Deepgram connection should already be created during join-interview
      // Verify it's ready before starting the interview
      if (!session.deepgramConnection) {
        this.logger.error(`[Session ${sessionId}] ❌ Deepgram connection not found! Cannot start interview.`);
        client.emit('error', { message: 'Deepgram connection not ready. Please refresh and try again.' });
        return;
      }

      if (!session.deepgramConnectionOpen) {
        this.logger.warn(`[Session ${sessionId}] ⚠️ Deepgram connection not open yet. Waiting for connection...`);
        // Wait up to 5 seconds for Deepgram to be ready
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds (50 * 100ms)
        while (!session.deepgramConnectionOpen && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!session.deepgramConnectionOpen) {
          this.logger.error(`[Session ${sessionId}] ❌ Deepgram connection not ready after waiting. Cannot start interview.`);
          client.emit('error', { message: 'Deepgram connection not ready. Please refresh and try again.' });
          return;
        }
      }

      this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection confirmed ready. Starting interview...`);
      
      // Clean up any old temp files before starting interview
      try {
        await this.tempStorageService.cleanupInterviewTempDir(data.interviewId);
        this.logger.log(`[Session ${sessionId}] ✅ Cleaned up temp directory for interview ${data.interviewId}`);
      } catch (error: any) {
        this.logger.warn(`[Session ${sessionId}] ⚠️ Failed to cleanup temp directory: ${error.message}`);
        // Don't block interview start if cleanup fails
      }
      
      // Mark interview as started
      session.isInterviewStarted = true;
      session.startedAt = new Date(); // Track when interview actually starts
      this.logger.log(`[Session ${sessionId}] ✅ Interview marked as started at ${session.startedAt.toISOString()}`);
      
      // Start automatic duration check timer to end interview gracefully at 5 minutes
      this.startDurationCheckTimer(sessionId, client);

      // Use pre-generated greeting if available, otherwise generate it now
      let greeting: string;
      if (session.preGeneratedGreeting) {
        greeting = session.preGeneratedGreeting;
        this.logger.log(`[Session ${sessionId}] ✅ Using pre-generated greeting`);
        // Clear the pre-generated greeting after use
        session.preGeneratedGreeting = undefined;
      } else {
        // Fallback: generate greeting if pre-generation didn't complete
        this.logger.log(`[Session ${sessionId}] ⚠️ Pre-generated greeting not available, generating now...`);
        greeting = await this.geminiService.initializeInterview(session.interviewContext);
      }
      
      session.conversationHistory.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      });

      const greetingTimestamp = new Date().toISOString();
      this.logger.log(`[Session ${sessionId}] 🤖 AI GREETING [${greetingTimestamp}]: "${greeting}"`);

      // Send greeting immediately (don't wait for Deepgram connection)
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

  @SubscribeMessage('ensure-deepgram-ready')
  async handleEnsureDeepgramReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    const sessionId = client.data.sessionId;
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        this.logger.warn(`[Session ${sessionId}] Ensure Deepgram ready but session not found`);
        client.emit('deepgram-status', { ready: false, message: 'Session not found' });
        return;
      }

      // Check if Deepgram connection exists
      if (!session.deepgramConnection) {
        this.logger.warn(`[Session ${sessionId}] Deepgram connection does not exist, creating now...`);
        // Create Deepgram connection immediately
        try {
          const deepgramConnection = this.deepgramService.createLiveConnection(
            (text: string, isFinal: boolean) => {
              this.handleTranscript(sessionId, text, isFinal, client);
            },
            (error: Error) => {
              this.logger.error(`[Session ${sessionId}] Deepgram error:`, error);
              session.deepgramConnectionOpen = false;
              session.audioChunkQueue = [];
              client.emit('error', { message: 'Transcription error' });
            },
            () => {
              // onOpen callback
              session.deepgramConnectionOpen = true;
              this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection opened (created on demand)`);
              client.emit('deepgram-ready', { message: 'Deepgram connection is ready' });
              
              // Flush queued chunks
              if (session.audioChunkQueue.length > 0) {
                this.logger.log(`[Session ${sessionId}] Flushing ${session.audioChunkQueue.length} queued chunks...`);
                const queue = [...session.audioChunkQueue];
                session.audioChunkQueue = [];
                
                queue.forEach((chunk, index) => {
                  setTimeout(() => {
                    try {
                      this.deepgramService.sendAudio(deepgramConnection, chunk);
                    } catch (error) {
                      this.logger.error(`[Session ${sessionId}] Error sending queued chunk:`, error);
                    }
                  }, index * 50);
                });
              }
              
              // Start keepalive
              if (session.keepaliveInterval) {
                clearInterval(session.keepaliveInterval);
              }
              
              const keepaliveInterval = setInterval(() => {
                const currentSession = this.sessions.get(sessionId);
                if (!currentSession || !currentSession.deepgramConnection || currentSession.isDisconnecting) {
                  clearInterval(keepaliveInterval);
                  return;
                }
                
                if (currentSession.deepgramConnection.getReadyState() !== 1) {
                  clearInterval(keepaliveInterval);
                  currentSession.keepaliveInterval = undefined;
                  return;
                }
                
                const silenceDuration = 0.01;
                const sampleRate = 16000;
                const samples = Math.floor(sampleRate * silenceDuration);
                const silenceBuffer = Buffer.alloc(samples * 2);
                silenceBuffer.fill(0);
                
                try {
                  this.deepgramService.sendAudio(currentSession.deepgramConnection, silenceBuffer, true);
                } catch (error) {
                  this.logger.error(`[Session ${sessionId}] Error sending keepalive:`, error);
                  clearInterval(keepaliveInterval);
                  currentSession.keepaliveInterval = undefined;
                }
              }, 5000);
              
              session.keepaliveInterval = keepaliveInterval;
            },
          );

          deepgramConnection.on('close', (event?: any) => {
            const currentSession = this.sessions.get(sessionId);
            if (!currentSession || currentSession.isDisconnecting) {
              return;
            }
            
            currentSession.deepgramConnectionOpen = false;
            this.logger.warn(`[Session ${sessionId}] ⚠️ Deepgram connection closed`);
            
            if (currentSession.isInterviewStarted && !currentSession.isDisconnecting) {
              const isError = event?.code && event.code !== 1000;
              if (isError && currentSession.reconnectAttempts < 3) {
                this.logger.log(`[Session ${sessionId}] Attempting to reconnect Deepgram...`);
                this.reconnectDeepgram(sessionId, client, currentSession.audioChunkQueue.length);
              }
            }
          });

          session.deepgramConnection = deepgramConnection;
          this.logger.log(`[Session ${sessionId}] Deepgram connection created on demand, waiting for open...`);
          
          // Wait up to 5 seconds for connection to open
          let attempts = 0;
          const checkInterval = setInterval(() => {
            attempts++;
            if (session.deepgramConnectionOpen) {
              clearInterval(checkInterval);
              client.emit('deepgram-status', { ready: true, message: 'Deepgram connection is ready' });
            } else if (attempts >= 50) { // 5 seconds
              clearInterval(checkInterval);
              client.emit('deepgram-status', { ready: false, message: 'Deepgram connection timeout' });
            }
          }, 100);
        } catch (error: any) {
          this.logger.error(`[Session ${sessionId}] Failed to create Deepgram connection:`, error);
          client.emit('deepgram-status', { ready: false, message: error.message || 'Failed to create connection' });
        }
        return;
      }

      // Check if connection is open
      if (session.deepgramConnectionOpen) {
        this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection is ready`);
        client.emit('deepgram-status', { ready: true, message: 'Deepgram connection is ready' });
      } else {
        // Connection exists but not open yet - wait for it
        this.logger.log(`[Session ${sessionId}] ⏳ Deepgram connection exists but not open yet, waiting...`);
        
        // Wait up to 5 seconds for connection to open
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (session.deepgramConnectionOpen) {
            clearInterval(checkInterval);
            this.logger.log(`[Session ${sessionId}] ✅ Deepgram connection opened after ${attempts * 100}ms`);
            client.emit('deepgram-status', { ready: true, message: 'Deepgram connection is ready' });
          } else if (attempts >= 50) { // 5 seconds
            clearInterval(checkInterval);
            this.logger.warn(`[Session ${sessionId}] ⚠️ Deepgram connection not open after 5 seconds`);
            client.emit('deepgram-status', { ready: false, message: 'Connection timeout' });
          }
        }, 100);
      }
    } catch (error: any) {
      this.logger.error(`[Session ${sessionId || 'unknown'}] Error ensuring Deepgram ready:`, error);
      client.emit('deepgram-status', { ready: false, message: error.message || 'Unknown error' });
    }
  }

  @SubscribeMessage('user-finished-speaking')
  async handleUserFinishedSpeaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    const sessionId = client.data.sessionId;
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        this.logger.warn(`[Session ${sessionId}] User finished speaking but session not found - attempting fallback recovery...`);
        
        // FALLBACK: Try to recover by recreating session and transcribing accumulated audio
        try {
          const userId = client.data.userId;
          if (!userId) {
            this.logger.error(`[Session ${sessionId}] Cannot recover - userId not found`);
            return;
          }

          // Recreate session from database
          const interview = await this.prisma.interview.findUnique({
            where: { id: data.interviewId },
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

          if (!interview || !interview.template || !interview.template.questions.length) {
            this.logger.error(`[Session ${sessionId}] Cannot recover - interview not found or invalid`);
            return;
          }

          // Get accumulated audio chunks from temporary storage
          const audioStorage = this.audioChunkStorage.get(data.interviewId);
          if (!audioStorage || audioStorage.chunks.length === 0) {
            this.logger.warn(`[Session ${sessionId}] No accumulated audio chunks found for fallback transcription`);
            return;
          }

          this.logger.log(`[Session ${sessionId}] 🔄 FALLBACK: Transcribing ${audioStorage.chunks.length} accumulated audio chunks using Deepgram file API...`);

          // Combine all audio chunks into a single buffer
          const combinedAudio = Buffer.concat(audioStorage.chunks);
          
          // Use Deepgram file transcription API to transcribe the accumulated audio
          const deepgram = (this.deepgramService as any).deepgram;
          if (!deepgram) {
            this.logger.error(`[Session ${sessionId}] Cannot recover - Deepgram client not available`);
            return;
          }

          // Transcribe using Deepgram's buffer transcription
          const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            combinedAudio,
            {
              model: 'nova-2',
              language: 'en-US', // Default to English, can be enhanced to detect language
              smart_format: true,
              punctuate: true,
              mimetype: 'audio/raw', // Raw PCM audio
              sample_rate: 16000,
              channels: 1,
              encoding: 'linear16',
            },
          );

          if (error) {
            this.logger.error(`[Session ${sessionId}] Deepgram transcription error in fallback:`, error);
            return;
          }

          const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          
          if (!transcript || transcript.trim().length === 0) {
            this.logger.warn(`[Session ${sessionId}] Fallback transcription returned empty transcript`);
            return;
          }

          this.logger.log(`[Session ${sessionId}] ✅ FALLBACK: Successfully transcribed audio: "${transcript}"`);

          // Create a temporary session for processing
          const tempSessionId = `${data.interviewId}-${userId}`;
          const tempSession: InterviewSession = {
            interviewId: data.interviewId,
            userId,
            deepgramConnection: null,
            deepgramConnectionOpen: false,
            audioChunkQueue: [],
            isReconnecting: false,
            reconnectAttempts: 0,
            isDisconnecting: false,
            conversationHistory: [], // Will be loaded from database if needed
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
            isInterviewStarted: true, // Assume interview is started
            startedAt: new Date(),
            pendingTranscriptBuffer: '',
            lastTranscriptTime: 0,
            lastFollowUpSentTime: 0,
            followUpCount: 0,
            lastInterimTranscript: '',
            lastInterimTime: 0,
            askedQuestions: [],
            isClosingSent: false,
            isProcessingTranscript: false,
            lastProcessedTranscript: '',
            isGeneratingQuestion: false,
          };

          // Store temporary session
          this.sessions.set(tempSessionId, tempSession);
          client.data.sessionId = tempSessionId;

          // Process the transcript
          await this.processCompleteTranscript(tempSessionId, transcript.trim(), client);

          // Clean up temporary session after processing
          setTimeout(() => {
            this.sessions.delete(tempSessionId);
          }, 5000);

          // Clear audio storage after successful transcription
          this.audioChunkStorage.delete(data.interviewId);

          return;
        } catch (error: any) {
          this.logger.error(`[Session ${sessionId}] Error in fallback recovery:`, error);
          return;
        }
      }
      
      // User manually muted - they've finished speaking
      // Process ALL accumulated transcripts immediately
      if (session.pendingTranscriptBuffer && session.pendingTranscriptBuffer.trim().length > 0) {
        const completeTranscript = session.pendingTranscriptBuffer.trim();
        
        // Clear any existing timers since user explicitly finished speaking
        if (session.transcriptDebounceTimer) {
          clearTimeout(session.transcriptDebounceTimer);
          session.transcriptDebounceTimer = undefined;
        }
        if (session.interimStableTimer) {
          clearTimeout(session.interimStableTimer);
          session.interimStableTimer = undefined;
        }
        
        // Clear the buffer before processing (to prevent duplicate processing)
        session.pendingTranscriptBuffer = '';
        
        // Skip very short/filler transcripts
        const fillerPhrases = ['okay', 'ok', 'yes', 'no', 'uh', 'um', 'ah', 'sorry', 'thank you', 'thanks'];
        const isFiller = completeTranscript.length < 10 || 
          fillerPhrases.some(phrase => completeTranscript.toLowerCase().trim() === phrase.toLowerCase().trim());
        
        if (!isFiller) {
          this.logger.log(`[Session ${sessionId}] ✅ User finished speaking - processing complete transcript: "${completeTranscript}"`);
          await this.processCompleteTranscript(sessionId, completeTranscript, client);
        } else {
          this.logger.log(`[Session ${sessionId}] ⏭️ User finished speaking but transcript is filler - skipping: "${completeTranscript}"`);
        }
      } else {
        this.logger.log(`[Session ${sessionId}] User finished speaking but no transcript accumulated`);
      }
    } catch (error: any) {
      this.logger.error(`[Session ${sessionId || 'unknown'}] Error handling user finished speaking:`, error);
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

      // If Deepgram connection doesn't exist yet, queue the chunk
      // This can happen if audio arrives before 'start-interview' completes
      if (!session.deepgramConnection) {
        // Initialize queue if it doesn't exist
        if (!session.audioChunkQueue) {
          session.audioChunkQueue = [];
        }
        
        // Queue the chunk - it will be sent when connection is created
        const audioBuffer = Buffer.from(data.audio);
        session.audioChunkQueue.push(audioBuffer);
        
        // Log first few chunks to help debug
        if (session.audioChunkQueue.length <= 5) {
          this.logger.log(`[Session ${sessionId}] Audio chunk queued (Deepgram connection not created yet). Queue size: ${session.audioChunkQueue.length}. Interview started: ${session.isInterviewStarted}`);
        }
        
        // Limit queue size to prevent memory issues (keep last 200 chunks - increased for better transcription)
        // At 16kHz, 4096 samples = ~256ms per chunk, so 200 chunks = ~51 seconds of audio
        if (session.audioChunkQueue.length > 200) {
          session.audioChunkQueue.shift(); // Remove oldest chunk
          if (session.audioChunkQueue.length % 50 === 0) { // Log every 50th drop to avoid spam
            this.logger.warn(`[Session ${sessionId}] Audio queue limit reached, dropping oldest chunk (queue size: ${session.audioChunkQueue.length})`);
          }
        }
        
        return;
      }

      // Get audio buffer
      const audioBuffer = Buffer.from(data.audio);
      
      // CRITICAL: Also store audio chunks in temporary storage (keyed by interviewId) for fallback
      // This allows us to transcribe audio even if session is lost
      if (!this.audioChunkStorage.has(session.interviewId)) {
        this.audioChunkStorage.set(session.interviewId, { chunks: [], lastUpdated: Date.now() });
      }
      const storage = this.audioChunkStorage.get(session.interviewId)!;
      storage.chunks.push(audioBuffer);
      storage.lastUpdated = Date.now();
      
      // Limit storage size (keep last 300 chunks = ~77 seconds of audio for fallback)
      if (storage.chunks.length > 300) {
        storage.chunks.shift(); // Remove oldest chunk
      }
      
      // If connection is not open or we're reconnecting, queue the chunk
      if (!session.deepgramConnectionOpen || session.isReconnecting) {
        // Connection not open yet or reconnecting, queue the chunk
        session.audioChunkQueue.push(audioBuffer);
        
        // Log periodically to avoid spam (only log every 20th chunk or when queue gets large)
        if (session.audioChunkQueue.length % 20 === 0 || session.audioChunkQueue.length > 50) {
          const reason = session.isReconnecting ? 'reconnecting' : 'connection not open yet';
          this.logger.debug(`[Session ${sessionId}] Audio chunk queued (${reason}). Queue size: ${session.audioChunkQueue.length}`);
        }
        
        // Limit queue size to prevent memory issues (keep last 200 chunks - increased for better transcription)
        // At 16kHz, 4096 samples = ~256ms per chunk, so 200 chunks = ~51 seconds of audio
        if (session.audioChunkQueue.length > 200) {
          session.audioChunkQueue.shift(); // Remove oldest chunk
          if (session.audioChunkQueue.length % 50 === 0) { // Log every 50th drop to avoid spam
            this.logger.warn(`[Session ${sessionId}] Audio queue limit reached, dropping oldest chunk (queue size: ${session.audioChunkQueue.length})`);
          }
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
            
            // Restart keepalive for reconnected connection
            if (session.keepaliveInterval) {
              clearInterval(session.keepaliveInterval);
            }
            
            const keepaliveInterval = setInterval(() => {
              const currentSession = this.sessions.get(sessionId);
              if (!currentSession || !currentSession.deepgramConnection || currentSession.isDisconnecting) {
                clearInterval(keepaliveInterval);
                return;
              }
              
              if (currentSession.deepgramConnection.getReadyState() !== 1) {
                clearInterval(keepaliveInterval);
                currentSession.keepaliveInterval = undefined;
                return;
              }
              
              const silenceDuration = 0.01;
              const sampleRate = 16000;
              const samples = Math.floor(sampleRate * silenceDuration);
              const silenceBuffer = Buffer.alloc(samples * 2);
              silenceBuffer.fill(0);
              
              try {
                this.deepgramService.sendAudio(currentSession.deepgramConnection, silenceBuffer, true);
              } catch (error) {
                this.logger.error(`[Session ${sessionId}] Error sending keepalive:`, error);
                clearInterval(keepaliveInterval);
                currentSession.keepaliveInterval = undefined;
              }
            }, 5000);
            
            session.keepaliveInterval = keepaliveInterval;
            this.logger.log(`[Session ${sessionId}] ✅ Keepalive restarted after reconnection`);
            
            // Flush any queued chunks
            if (session.audioChunkQueue.length > 0) {
              this.logger.log(`[Session ${sessionId}] Flushing ${session.audioChunkQueue.length} queued chunks after reconnection...`);
              const queue = [...session.audioChunkQueue];
              session.audioChunkQueue = [];
              
              // Send queued chunks faster (50ms delay instead of 250ms) to catch up
              // This prevents the queue from growing too large during reconnection
              queue.forEach((chunk, index) => {
                setTimeout(() => {
                  try {
                    this.deepgramService.sendAudio(deepgramConnection, chunk);
                  } catch (error) {
                    this.logger.error(`[Session ${sessionId}] Error sending queued chunk after reconnect:`, error);
                  }
                }, index * 50); // Reduced from 250ms to 50ms for faster processing
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

    // SIMPLIFIED: Accumulate ALL transcripts (both interim and final) while user is speaking
    // We'll only process them when user mutes the mic (user-finished-speaking event)
    if (text.trim().length > 0) {
      // Use final transcripts when available, otherwise use interim
      // If we have a final transcript, it replaces any interim for that segment
      if (isFinal) {
        // For final transcripts, add to buffer (replace any interim version)
        if (session.pendingTranscriptBuffer) {
          // Check if this final transcript is similar to the last part of buffer
          // If so, replace it; otherwise append
          const lastWords = session.pendingTranscriptBuffer.split(' ').slice(-5).join(' ').toLowerCase();
          const currentWords = text.trim().toLowerCase();
          
          // If current transcript starts with similar words to last part of buffer, replace
          if (lastWords && currentWords.startsWith(lastWords.substring(0, Math.min(20, lastWords.length)))) {
            // Replace the last part with final version
            const words = session.pendingTranscriptBuffer.split(' ');
            words.splice(-5); // Remove last 5 words
            session.pendingTranscriptBuffer = words.join(' ') + ' ' + text.trim();
          } else {
            // Append new final transcript
            session.pendingTranscriptBuffer += ' ' + text.trim();
          }
        } else {
          session.pendingTranscriptBuffer = text.trim();
        }
      } else {
        // For interim transcripts, append or update the last part
        // Remove any previous interim and add the new one
        if (session.pendingTranscriptBuffer) {
          // Check if buffer ends with an interim transcript (no period/exclamation/question mark at end)
          const lastChar = session.pendingTranscriptBuffer.trim().slice(-1);
          if (!['.', '!', '?'].includes(lastChar)) {
            // Likely an interim, replace last part
            const words = session.pendingTranscriptBuffer.split(' ');
            // Remove last few words that might be interim
            words.splice(-3);
            session.pendingTranscriptBuffer = words.join(' ') + ' ' + text.trim();
          } else {
            // Buffer ends with final transcript, append interim
            session.pendingTranscriptBuffer += ' ' + text.trim();
          }
        } else {
          session.pendingTranscriptBuffer = text.trim();
        }
      }
      
      this.logger.log(`[Session ${sessionId}] 📦 Accumulated transcript: "${session.pendingTranscriptBuffer}"`);
    }
    
    // DO NOT process transcripts automatically - wait for user to mute mic
    // The user-finished-speaking event will trigger processing
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

      // Wait longer before ending to allow AI to finish speaking the closing message
      // Estimate: closing message is typically 2-3 sentences, which takes ~5-8 seconds to speak
      // We'll wait 10 seconds to be safe, allowing the frontend to wait for actual speech completion
      setTimeout(async () => {
        // Save conversation history to database before ending
        if (session.conversationHistory && session.conversationHistory.length > 0) {
          try {
            // Get transcript from conversation history (user messages only)
            const userMessages = session.conversationHistory
              .filter(msg => msg.role === 'user')
              .map(msg => msg.content);
            const transcriptText = userMessages.join(' ');

            // Get transcript with timestamps
            const transcriptWithTimestamps = session.conversationHistory
              .filter(msg => msg.role === 'user')
              .map(msg => ({
                text: msg.content,
                timestamp: msg.timestamp.getTime(),
              }));

            // Format conversation history for database
            const formattedConversationHistory = session.conversationHistory.map(msg => ({
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp.toISOString(),
            }));

            this.logger.log(`[Session ${sessionId}] Saving conversation history to database (${session.conversationHistory.length} messages)`);

            // Complete the interview with conversation history
            await this.prisma.interview.update({
              where: { id: session.interviewId },
              data: {
                status: InterviewStatus.awaiting_review,
                completedAt: new Date(),
                transcript: transcriptText,
                transcriptWithTimestamps: transcriptWithTimestamps as any,
                conversationHistory: formattedConversationHistory as any,
              },
            });

            this.logger.log(`[Session ${sessionId}] ✅ Conversation history saved to database`);
          } catch (error: any) {
            this.logger.error(`[Session ${sessionId}] ❌ Failed to save conversation history:`, error);
            // Don't fail the interview end if saving conversation fails
          }
        }

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
      }, 10000); // Increased from 1000ms to 10000ms (10 seconds) to allow AI to finish speaking
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
        
        // Clear duration check timer if exists
        if (session.durationCheckTimer) {
          clearTimeout(session.durationCheckTimer);
          session.durationCheckTimer = undefined;
        }
        
        // Close Deepgram connection
        if (session.deepgramConnection) {
          this.deepgramService.closeConnection(session.deepgramConnection);
        }

        // Save conversation history to database
        if (session.conversationHistory && session.conversationHistory.length > 0) {
          try {
            // Get transcript from conversation history (user messages only)
            const userMessages = session.conversationHistory
              .filter(msg => msg.role === 'user')
              .map(msg => msg.content);
            const transcriptText = userMessages.join(' ');

            // Get transcript with timestamps
            const transcriptWithTimestamps = session.conversationHistory
              .filter(msg => msg.role === 'user')
              .map(msg => ({
                text: msg.content,
                timestamp: msg.timestamp.getTime(),
              }));

            // Format conversation history for database
            const formattedConversationHistory = session.conversationHistory.map(msg => ({
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp.toISOString(),
            }));

            this.logger.log(`[Session ${sessionId}] Saving conversation history to database (${session.conversationHistory.length} messages)`);

            // Complete the interview with conversation history
            await this.prisma.interview.update({
              where: { id: session.interviewId },
              data: {
                status: InterviewStatus.awaiting_review,
                completedAt: new Date(),
                transcript: transcriptText,
                transcriptWithTimestamps: transcriptWithTimestamps as any,
                conversationHistory: formattedConversationHistory as any,
              },
            });

            this.logger.log(`[Session ${sessionId}] ✅ Conversation history saved to database`);
          } catch (error: any) {
            this.logger.error(`[Session ${sessionId}] ❌ Failed to save conversation history:`, error);
            // Don't fail the interview end if saving conversation fails
          }
        } else {
          this.logger.warn(`[Session ${sessionId}] No conversation history to save`);
        }

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

  /**
   * Start a timer that periodically checks if 5 minutes have passed
   * and gracefully ends the interview if so
   */
  private startDurationCheckTimer(sessionId: string, client: Socket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Check every 10 seconds if 5 minutes have passed
    const checkInterval = 10000; // 10 seconds
    const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes

    const checkDuration = () => {
      const currentSession = this.sessions.get(sessionId);
      if (!currentSession || !currentSession.isInterviewStarted || currentSession.isDisconnecting) {
        // Session ended or is disconnecting, stop checking
        if (currentSession?.durationCheckTimer) {
          clearTimeout(currentSession.durationCheckTimer);
          currentSession.durationCheckTimer = undefined;
        }
        return;
      }

      const elapsedTime = Date.now() - currentSession.startedAt.getTime();
      const elapsedMinutes = elapsedTime / (60 * 1000);

      // If 5 minutes have passed, gracefully end the interview
      if (elapsedTime >= MAX_DURATION_MS) {
        this.logger.log(
          `[Session ${sessionId}] ⏰ 5 minutes elapsed (${elapsedMinutes.toFixed(1)} minutes). ` +
          `Gracefully ending interview...`
        );

        // Clear the timer
        if (currentSession.durationCheckTimer) {
          clearTimeout(currentSession.durationCheckTimer);
          currentSession.durationCheckTimer = undefined;
        }

        // Check if closing message was already sent
        if (currentSession.isClosingSent) {
          this.logger.log(`[Session ${sessionId}] Closing already sent, just ending interview...`);
          // End interview immediately
          this.endInterviewGracefully(sessionId, client);
          return;
        }

        // Send closing message and end gracefully
        this.endInterviewAt5Minutes(sessionId, client);
      } else {
        // Schedule next check
        currentSession.durationCheckTimer = setTimeout(checkDuration, checkInterval);
      }
    };

    // Start checking after a short delay (wait for interview to be fully started)
    session.durationCheckTimer = setTimeout(checkDuration, checkInterval);
    this.logger.log(`[Session ${sessionId}] ⏱️ Duration check timer started (will check every 10 seconds for 5-minute limit)`);
  }

  /**
   * End interview gracefully when 5 minutes are reached
   */
  private async endInterviewAt5Minutes(sessionId: string, client: Socket): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isClosingSent) {
      return;
    }

    session.isClosingSent = true;

    try {
      // Generate and send closing message
      const closing = await this.geminiService.generateClosing();

      session.conversationHistory.push({
        role: 'assistant',
        content: closing,
        timestamp: new Date(),
      });

      const closingTimestamp = new Date().toISOString();
      this.logger.log(`[Session ${sessionId}] 🤖 AI CLOSING (5-minute limit) [${closingTimestamp}]: "${closing}"`);

      client.emit('ai-message', {
        message: closing,
        type: 'closing',
      });

      // Wait for AI to finish speaking before ending (same as normal flow)
      setTimeout(async () => {
        await this.endInterviewGracefully(sessionId, client);
      }, 10000); // 10 seconds to allow speech to complete
    } catch (error: any) {
      this.logger.error(`[Session ${sessionId}] Error ending interview at 5 minutes:`, error);
      // Still end the interview even if closing message fails
      await this.endInterviewGracefully(sessionId, client);
    }
  }

  /**
   * Gracefully end the interview (save data, cleanup, notify client)
   */
  private async endInterviewGracefully(sessionId: string, client: Socket): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Mark as disconnecting
    session.isDisconnecting = true;
    session.isReconnecting = false;

    // Clear all timers
    if (session.transcriptDebounceTimer) {
      clearTimeout(session.transcriptDebounceTimer);
      session.transcriptDebounceTimer = undefined;
    }
    if (session.interimStableTimer) {
      clearTimeout(session.interimStableTimer);
      session.interimStableTimer = undefined;
    }
    if (session.durationCheckTimer) {
      clearTimeout(session.durationCheckTimer);
      session.durationCheckTimer = undefined;
    }

    // Close Deepgram connection
    if (session.deepgramConnection) {
      this.deepgramService.closeConnection(session.deepgramConnection);
    }

    // Save conversation history to database
    if (session.conversationHistory && session.conversationHistory.length > 0) {
      try {
        const userMessages = session.conversationHistory
          .filter(msg => msg.role === 'user')
          .map(msg => msg.content);
        const transcriptText = userMessages.join(' ');

        const transcriptWithTimestamps = session.conversationHistory
          .filter(msg => msg.role === 'user')
          .map(msg => ({
            text: msg.content,
            timestamp: msg.timestamp.getTime(),
          }));

        const formattedConversationHistory = session.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
        }));

        this.logger.log(`[Session ${sessionId}] Saving conversation history to database (${session.conversationHistory.length} messages)`);

        await this.prisma.interview.update({
          where: { id: session.interviewId },
          data: {
            status: InterviewStatus.awaiting_review,
            completedAt: new Date(),
            transcript: transcriptText,
            transcriptWithTimestamps: transcriptWithTimestamps as any,
            conversationHistory: formattedConversationHistory as any,
          },
        });

        this.logger.log(`[Session ${sessionId}] ✅ Conversation history saved to database`);
      } catch (error: any) {
        this.logger.error(`[Session ${sessionId}] ❌ Failed to save conversation history:`, error);
      }
    }

    // Cleanup session
    this.sessions.delete(sessionId);
    this.logger.log(`[Session ${sessionId}] ✅ Interview ended gracefully (5-minute limit reached)`);

    // Notify client
    if (client.connected) {
      client.emit('interview-ended', {
        message: 'Interview ended automatically after 5 minutes',
      });
    }
  }
}
