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
import { LiveInterviewDeepgramService } from '../interview/services/live-interview-deepgram.service';

@Injectable()
@WebSocketGateway({
  namespace: '/transcription',
  transport: ['websocket'],
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class TranscriptionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TranscriptionGateway.name);
  private connectedClients = new Map<string, string>(); // socketId -> userId

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
      this.connectedClients.set(client.id, payload.sub);
      this.logger.log(`Transcription client connected: ${client.id}, User ID: ${payload.sub}`);
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Transcription client disconnected: ${client.id}`);
  }

  @SubscribeMessage('transcribe-audio')
  async handleTranscribeAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { audio: string; language?: string }, // audio as base64 string
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) {
        client.emit('error', { message: 'User not authenticated' });
        return;
      }

      this.logger.log(`Transcribing audio for client: ${client.id}, User: ${userId}`);

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(data.audio, 'base64');
      this.logger.log(`Received audio file: ${audioBuffer.length} bytes`);

      // Transcribe using Deepgram file transcription
      // We'll use a temporary approach: upload to a temporary URL or use buffer directly
      // For now, let's use Deepgram's buffer transcription if available
      const transcript = await this.transcribeAudioBuffer(audioBuffer, data.language || 'en-US');

      this.logger.log(`Transcription complete: ${transcript.length} characters`);
      client.emit('transcript-complete', { transcript });
    } catch (error: any) {
      this.logger.error('Error transcribing audio:', error);
      client.emit('error', { message: error.message || 'Failed to transcribe audio' });
    }
  }

  private async transcribeAudioBuffer(audioBuffer: Buffer, language: string): Promise<string> {
    if (!this.deepgramService['deepgram']) {
      throw new Error('Deepgram client not initialized');
    }

    const deepgram = this.deepgramService['deepgram'];
    
    // Use Deepgram's prerecorded transcription with buffer
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: this.mapLanguageCode(language),
        smart_format: true,
        punctuate: true,
        mimetype: 'audio/webm', // Adjust based on your audio format
      },
    );

    if (error) {
      throw new Error(`Deepgram transcription error: ${error.message}`);
    }

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return transcript;
  }

  private mapLanguageCode(language: string): string {
    const languageMap: Record<string, string> = {
      en: 'en-US',
      ar: 'ar',
      hi: 'hi',
      ur: 'ur',
      bn: 'bn',
    };
    return languageMap[language] || 'en-US';
  }
}
