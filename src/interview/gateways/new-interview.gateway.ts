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
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NewInterviewDeepgramService } from '../services/new-interview-deepgram.service';

interface StreamingSession {
  socketId: string;
  userId: string;
  deepgramConnection: any; // Deepgram LiveClient
  isConnected: boolean;
  keepaliveInterval?: NodeJS.Timeout;
  audioStats?: {
    chunksReceived: number;
    bytesReceived: number;
    chunksSent: number;
    bytesSent: number;
    transcriptsReceived: number;
    lastAudioTime: number;
  };
}

@Injectable()
@WebSocketGateway({
  namespace: '/new-interview',
  transport: ['websocket'],
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class NewInterviewGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NewInterviewGateway.name);
  private sessions = new Map<string, StreamingSession>();

  constructor(
    private jwtService: JwtService,
    private deepgramService: NewInterviewDeepgramService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || 
                   client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn('No token provided, disconnecting client');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      client.data.userId = userId;
      
      this.logger.log(`New interview client connected: ${client.id}, User ID: ${userId}`);
      
      // Initialize session
      this.sessions.set(client.id, {
        socketId: client.id,
        userId,
        deepgramConnection: null,
        isConnected: false,
        audioStats: {
          chunksReceived: 0,
          bytesReceived: 0,
          chunksSent: 0,
          bytesSent: 0,
          transcriptsReceived: 0,
          lastAudioTime: 0,
        },
      });

      client.emit('connected', { message: 'Connected to interview server' });
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (session) {
      // Log final statistics
      if (session.audioStats) {
        const stats = session.audioStats;
        const audioDuration = (stats.bytesReceived / 2) / 16000;
        this.logger.log(
          `📊 Final Stats for ${client.id}: ` +
          `Chunks: ${stats.chunksReceived} received, ${stats.chunksSent} sent | ` +
          `Bytes: ${(stats.bytesReceived / 1024).toFixed(1)}KB received, ${(stats.bytesSent / 1024).toFixed(1)}KB sent | ` +
          `Duration: ${audioDuration.toFixed(1)}s | ` +
          `Transcripts: ${stats.transcriptsReceived}`
        );
      }
      
      // Clear intervals
      if (session.keepaliveInterval) {
        clearInterval(session.keepaliveInterval);
      }
      if ((session as any).statsInterval) {
        clearInterval((session as any).statsInterval);
      }
      
      // Close Deepgram connection if exists
      if (session.deepgramConnection) {
        try {
          this.deepgramService.closeConnection(session.deepgramConnection);
        } catch (error) {
          this.logger.error('Error closing Deepgram connection:', error);
        }
      }
      this.sessions.delete(client.id);
    }
    this.logger.log(`New interview client disconnected: ${client.id}`);
  }

  @SubscribeMessage('start-transcription')
  async handleStartTranscription(@ConnectedSocket() client: Socket) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        client.emit('error', { message: 'Session not found' });
        return;
      }

      this.logger.log(`Starting transcription for client: ${client.id}`);

      // Create Deepgram connection
      const deepgramConnection = this.deepgramService.createConnection(
        (text: string, isFinal: boolean) => {
          // Update statistics
          if (session.audioStats) {
            session.audioStats.transcriptsReceived++;
            if (isFinal) {
              this.logger.log(`✅ Transcription successful! Final transcript #${session.audioStats.transcriptsReceived}: "${text}"`);
            }
          }
          
          // Forward transcript to client
          client.emit('transcript', {
            text,
            isFinal,
            timestamp: Date.now(),
          });
        },
        (error: Error) => {
          this.logger.error('Deepgram error:', error);
          client.emit('error', { message: error.message });
        },
        () => {
          // On open
          session.isConnected = true;
          client.emit('deepgram-connected', { message: 'Connected to Deepgram' });
        },
      );

      session.deepgramConnection = deepgramConnection;
      this.logger.log(`Deepgram connection created for client: ${client.id}`);
      
      // Log statistics periodically
      const statsInterval = setInterval(() => {
        if (!session || !session.audioStats) {
          clearInterval(statsInterval);
          return;
        }
        
        const stats = session.audioStats;
        const timeSinceLastAudio = Date.now() - stats.lastAudioTime;
        const audioDuration = (stats.bytesReceived / 2) / 16000;
        
        this.logger.log(
          `📊 Audio Stats for ${client.id}: ` +
          `Chunks: ${stats.chunksReceived} received, ${stats.chunksSent} sent | ` +
          `Bytes: ${(stats.bytesReceived / 1024).toFixed(1)}KB received, ${(stats.bytesSent / 1024).toFixed(1)}KB sent | ` +
          `Duration: ${audioDuration.toFixed(1)}s | ` +
          `Transcripts: ${stats.transcriptsReceived} | ` +
          `Last audio: ${timeSinceLastAudio > 1000 ? (timeSinceLastAudio / 1000).toFixed(1) + 's ago' : 'just now'}`
        );
      }, 10000); // Every 10 seconds
      
      // Store stats interval to clear on disconnect
      (session as any).statsInterval = statsInterval;
      
      // Set up keepalive to prevent idle timeout
      // Deepgram closes connections after ~12 seconds of inactivity
      // Send silence packets every 5 seconds to keep connection alive
      const keepaliveInterval = setInterval(() => {
        if (!session.deepgramConnection || session.deepgramConnection.getReadyState() !== 1) {
          clearInterval(keepaliveInterval);
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
          this.deepgramService.sendAudio(session.deepgramConnection, silenceBuffer, true);
        } catch (error) {
          this.logger.error('Error sending keepalive:', error);
          clearInterval(keepaliveInterval);
        }
      }, 5000); // Send every 5 seconds
      
      // Store interval ID to clear it on disconnect
      session.keepaliveInterval = keepaliveInterval;
      
      // Log connection state periodically
      setTimeout(() => {
        if (session.deepgramConnection) {
          const state = session.deepgramConnection.getReadyState();
          this.logger.log(`Deepgram connection state for ${client.id}: ${state} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
        }
      }, 2000);
    } catch (error: any) {
      this.logger.error('Error starting transcription:', error);
      client.emit('error', { message: error.message || 'Failed to start transcription' });
    }
  }

  @SubscribeMessage('stop-transcription')
  async handleStopTranscription(@ConnectedSocket() client: Socket) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        return;
      }

      if (session.deepgramConnection) {
        // Clear keepalive interval
        if (session.keepaliveInterval) {
          clearInterval(session.keepaliveInterval);
          session.keepaliveInterval = undefined;
        }
        
        this.deepgramService.closeConnection(session.deepgramConnection);
        session.deepgramConnection = null;
        session.isConnected = false;
        this.logger.log(`Stopped transcription for client: ${client.id}`);
        client.emit('transcription-stopped', { message: 'Transcription stopped' });
      }
    } catch (error: any) {
      this.logger.error('Error stopping transcription:', error);
      client.emit('error', { message: error.message || 'Failed to stop transcription' });
    }
  }

  @SubscribeMessage('audio-data')
  async handleAudioData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        // Log first few missing sessions
        if (Math.random() < 0.1) {
          this.logger.warn(`Audio data received but session not found for client: ${client.id}`);
        }
        return;
      }

      if (!session.deepgramConnection) {
        // Log first few times if connection not ready
        if (!(session as any).loggedNoConnection) {
          this.logger.warn(`Deepgram connection not ready for client: ${client.id}`);
          (session as any).loggedNoConnection = true;
        }
        return;
      }

      if (!session.isConnected) {
        // Log first few times if not connected
        if (!(session as any).loggedNotConnected) {
          this.logger.warn(`Deepgram not connected yet for client: ${client.id}`);
          (session as any).loggedNotConnected = true;
        }
        return;
      }

      // Forward audio data to Deepgram
      if (!data || !data.audio) {
        // Log first few times if no audio data
        if (!(session as any).loggedNoAudio) {
          this.logger.warn(`No audio data in message from client: ${client.id}`, {
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            audioType: data?.audio ? typeof data.audio : 'undefined',
          });
          (session as any).loggedNoAudio = true;
        }
        return;
      }

      let audioBuffer: Buffer;
      
      // Handle different data types that Socket.IO might send
      try {
        if (Buffer.isBuffer(data.audio)) {
          audioBuffer = data.audio;
        } else if (data.audio instanceof ArrayBuffer) {
          audioBuffer = Buffer.from(data.audio);
        } else if (data.audio.buffer instanceof ArrayBuffer) {
          // Handle TypedArray (Uint8Array, Int16Array, etc.)
          audioBuffer = Buffer.from(data.audio.buffer, data.audio.byteOffset, data.audio.byteLength);
        } else if (Array.isArray(data.audio)) {
          audioBuffer = Buffer.from(data.audio);
        } else if (typeof data.audio === 'object' && data.audio.data) {
          // Socket.IO might wrap binary data
          audioBuffer = Buffer.from(data.audio.data);
        } else {
          // Try to convert to buffer
          audioBuffer = Buffer.from(data.audio as any);
        }
      } catch (conversionError: any) {
        if (!(session as any).loggedConversionError) {
          this.logger.error(`Error converting audio data for client ${client.id}:`, conversionError);
          this.logger.error('Audio data type:', typeof data.audio, 'Constructor:', data.audio?.constructor?.name);
          (session as any).loggedConversionError = true;
        }
        return;
      }

        if (audioBuffer && audioBuffer.length > 0) {
          // Update statistics
          if (session.audioStats) {
            session.audioStats.chunksReceived++;
            session.audioStats.bytesReceived += audioBuffer.length;
            session.audioStats.lastAudioTime = Date.now();
          }
          
          // Log first chunk to verify reception
          if (session.audioStats && session.audioStats.chunksReceived === 1) {
            this.logger.log(
              `✅ FIRST audio chunk received from ${client.id}: ${audioBuffer.length} bytes ` +
              `(${((audioBuffer.length / 2) / 16000 * 1000).toFixed(1)}ms)`
            );
          }
          
          // Log every 50th chunk (about once per second)
          if (session.audioStats && session.audioStats.chunksReceived % 50 === 0) {
            const duration = (audioBuffer.length / 2) / 16000; // 16-bit = 2 bytes per sample
            const totalDuration = (session.audioStats.bytesReceived / 2) / 16000;
            this.logger.log(
              `📥 Audio chunk #${session.audioStats.chunksReceived}: ${audioBuffer.length} bytes ` +
              `(${(duration * 1000).toFixed(1)}ms) | Total: ${(totalDuration).toFixed(1)}s of audio received`
            );
          }
          
          // Send to Deepgram
          this.deepgramService.sendAudio(session.deepgramConnection, audioBuffer, false);
          
          // Update sent statistics
          if (session.audioStats) {
            session.audioStats.chunksSent++;
            session.audioStats.bytesSent += audioBuffer.length;
          }
        } else {
          // Log if buffer is empty
          if (!(session as any).loggedEmptyBuffer) {
            this.logger.warn(`Empty audio buffer received from client: ${client.id}`);
            (session as any).loggedEmptyBuffer = true;
          }
        }
    } catch (error: any) {
      // Log errors occasionally to avoid spam
      if (Math.random() < 0.01) {
        this.logger.error('Error sending audio data:', error);
      }
    }
  }
}
