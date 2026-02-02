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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LiveInterviewDeepgramService } from '../interview/services/live-interview-deepgram.service';
import { LiveClient } from '@deepgram/sdk';

interface TranscriptionSession {
  socket: Socket;
  deepgramConnection: LiveClient | null;
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/transcription',
})
export class TranscriptionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TranscriptionGateway.name);
  private sessions = new Map<string, TranscriptionSession>();

  constructor(
    private jwtService: JwtService,
    private deepgramService: LiveInterviewDeepgramService,
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
      client.data.userId = payload.sub;
      this.logger.log(`Transcription client connected: ${client.id}, User ID: ${payload.sub}`);
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (session?.deepgramConnection) {
      this.logger.log(`Closing Deepgram connection for client: ${client.id}`);
      this.deepgramService.closeConnection(session.deepgramConnection);
    }
    this.sessions.delete(client.id);
    this.logger.log(`Transcription client disconnected: ${client.id}`);
  }

  @SubscribeMessage('start-transcription')
  async handleStartTranscription(@ConnectedSocket() client: Socket) {
    try {
      const userId = client.data.userId;
      if (!userId) {
        client.emit('error', { message: 'User not authenticated' });
        return;
      }

      this.logger.log(`Starting transcription for client: ${client.id}, User: ${userId}`);

      // Create Deepgram connection on backend
      const deepgramConnection = this.deepgramService.createLiveConnection(
        (text, isFinal, timestamp) => {
          // Forward transcript to client
          client.emit('transcript', { text, isFinal, timestamp });
        },
        (error) => {
          this.logger.error(`Deepgram error for client ${client.id}:`, error);
          client.emit('error', { message: error.message });
        },
        () => {
          this.logger.log(`Deepgram connection opened for client: ${client.id}`);
          client.emit('connected');
        }
      );

      this.sessions.set(client.id, {
        socket: client,
        deepgramConnection,
        userId,
      });

      this.logger.log(`Transcription started for client: ${client.id}`);
    } catch (error: any) {
      this.logger.error('Error starting transcription:', error);
      client.emit('error', { message: error.message || 'Failed to start transcription' });
    }
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { audio: number[] },
  ) {
    try {
      const session = this.sessions.get(client.id);
      if (!session) {
        client.emit('error', { message: 'No active transcription session' });
        return;
      }

      if (session.deepgramConnection) {
        // Convert number array back to Int16Array buffer
        const int16Array = new Int16Array(data.audio);
        const audioBuffer = Buffer.from(int16Array.buffer);
        this.deepgramService.sendAudio(session.deepgramConnection, audioBuffer);
      } else {
        this.logger.warn(`No Deepgram connection for client: ${client.id}`);
      }
    } catch (error: any) {
      this.logger.error('Error processing audio chunk:', error);
      client.emit('error', { message: error.message || 'Failed to process audio' });
    }
  }

  @SubscribeMessage('stop-transcription')
  async handleStopTranscription(@ConnectedSocket() client: Socket) {
    const session = this.sessions.get(client.id);
    if (session?.deepgramConnection) {
      this.logger.log(`Stopping transcription for client: ${client.id}`);
      this.deepgramService.closeConnection(session.deepgramConnection);
      this.sessions.delete(client.id);
      client.emit('stopped');
    } else {
      this.logger.warn(`No active session to stop for client: ${client.id}`);
    }
  }
}
