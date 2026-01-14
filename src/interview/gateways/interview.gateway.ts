import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GeminiRealtimeService } from '../services/gemini-realtime.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class InterviewGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeInterviews = new Map<string, { socket: Socket; geminiSession: any }>();

  constructor(
    private jwtService: JwtService,
    private geminiRealtimeService: GeminiRealtimeService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.interviewId = client.handshake.query.interviewId as string;

      console.log(`Client connected: ${client.data.userId} for interview ${client.data.interviewId}`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const interviewId = client.data.interviewId;
    if (interviewId && this.activeInterviews.has(interviewId)) {
      const session = this.activeInterviews.get(interviewId);
      if (session?.geminiSession) {
        this.geminiRealtimeService.closeSession(session.geminiSession);
      }
      this.activeInterviews.delete(interviewId);
    }
    console.log(`Client disconnected: ${client.data.userId}`);
  }

  @SubscribeMessage('start-interview')
  async handleStartInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; language: string },
  ) {
    try {
      const geminiSession = await this.geminiRealtimeService.createSession(
        data.language,
        (transcript) => {
          // Send transcript to client
          client.emit('transcript', transcript);
          // Broadcast to recruiter if connected
          this.server.to(`recruiter-${data.interviewId}`).emit('transcript', transcript);
        },
        (audioChunk) => {
          // Send AI audio response to client
          client.emit('audio-response', audioChunk);
        },
      );

      this.activeInterviews.set(data.interviewId, {
        socket: client,
        geminiSession,
      });

      client.emit('interview-started', { success: true });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; audio: ArrayBuffer },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (session?.geminiSession) {
        await this.geminiRealtimeService.sendAudio(session.geminiSession, data.audio);
      }
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('end-interview')
  async handleEndInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (session?.geminiSession) {
        await this.geminiRealtimeService.closeSession(session.geminiSession);
        this.activeInterviews.delete(data.interviewId);
      }
      client.emit('interview-ended', { success: true });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }
}
