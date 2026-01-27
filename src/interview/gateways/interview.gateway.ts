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
import { DeepgramService } from '../services/deepgram.service';
import { InterviewService } from '../interview.service';
import { LiveClient } from '@deepgram/sdk';

@Injectable()
@WebSocketGateway({
  transport: ['websocket'],
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class InterviewGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private activeInterviews = new Map<
    string,
    {
      socket: Socket;
      geminiSession: any;
      deepgramConnection: LiveClient | null;
      transcripts: Array<{ text: string; timestamp: number; language: string }>;
      templateQuestions?: Array<{ id: string; question: string; type: string; order: number; timeLimit?: number }>;
      currentQuestionIndex?: number;
    }
  >();

  constructor(
    private jwtService: JwtService,
    private geminiRealtimeService: GeminiRealtimeService,
    private deepgramService: DeepgramService,
    private interviewService: InterviewService,
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

      console.log(
        `Client connected: ${client.data.userId} for interview ${client.data.interviewId}`,
      );
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
      if (session?.deepgramConnection) {
        this.deepgramService.closeConnection(session.deepgramConnection);
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
      const transcripts: Array<{ text: string; timestamp: number; language: string }> = [];
      
      // Fetch interview with template questions
      const interview = await this.interviewService.getInterview(data.interviewId);
      const templateQuestions = interview.template?.questions?.map(q => ({
        id: q.id,
        question: q.question,
        type: q.type as string,
        order: q.order,
        timeLimit: q.timeLimit ?? undefined,
      })) || [];
      
      // Emit template questions to client
      if (templateQuestions.length > 0) {
        client.emit('template-questions', { questions: templateQuestions });
      }

      // Prepare context for AI
      const jobDescription = interview.job?.description || '';
      const jobTitle = interview.job?.title || '';
      const requiredSkills = interview.job?.requiredSkills || [];
      const candidateName = interview.candidate ? 
        `${interview.candidate.firstName || ''} ${interview.candidate.lastName || ''}`.trim() || 'Candidate' : 
        'Candidate';
      const candidateResume = interview.candidate?.resumeUrl ? 
        `Resume available at: ${interview.candidate.resumeUrl}` : 
        'Resume not provided';
      const candidateSkills = interview.candidate?.skills || [];
      
      // Create Gemini session for AI responses with enhanced context
      const geminiSession = await this.geminiRealtimeService.createSession(
        data.language,
        {
          jobDescription,
          jobTitle,
          requiredSkills: requiredSkills as string[],
          candidateName,
          candidateResume,
          candidateSkills: candidateSkills as string[],
        },
        (transcript) => {
          // This is for AI responses (not candidate speech)
          // Store transcript with timestamp
          transcripts.push({
            text: transcript.text,
            timestamp: transcript.timestamp || Date.now(),
            language: transcript.language || data.language,
          });
          
          // Send transcript to client
          client.emit('transcript', transcript);
          // Broadcast to client if connected
          this.server
            .to(`client-${data.interviewId}`)
            .emit('transcript', transcript);
        },
        (audioChunk) => {
          // Send AI audio response to client
          client.emit('audio-response', audioChunk);
        },
      );

      // Create Deepgram connection for transcription
      const deepgramConnection = this.deepgramService.createLiveConnection(
        (text, isFinal, timestamp) => {
          // Store candidate transcript
          const transcript = {
            text,
            timestamp,
            language: data.language,
          };
          
          transcripts.push(transcript);
          
          // Send transcript to client
          client.emit('transcript', {
            text,
            timestamp,
            language: data.language,
            isFinal,
            speaker: 'candidate',
          });
          
          // Broadcast to client if connected
          this.server
            .to(`client-${data.interviewId}`)
            .emit('transcript', {
              text,
              timestamp,
              language: data.language,
              isFinal,
              speaker: 'candidate',
            });

          // If transcript is final, send to Gemini for AI response
          if (isFinal && text.trim()) {
            // Analyze response quality in real-time
            const session = this.activeInterviews.get(data.interviewId);
            if (session) {
              const currentQuestion = session.templateQuestions?.[session.currentQuestionIndex || 0];
              if (currentQuestion) {
                const analysis = this.analyzeResponseQuality(text, currentQuestion.question);
                client.emit('response-quality', analysis);
              }
            }

            this.geminiRealtimeService
              .sendText(geminiSession, text)
              .catch((error) => {
                console.error('Error sending text to Gemini:', error);
                client.emit('error', { message: 'Failed to process response' });
              });
          }
        },
        (error) => {
          console.error('Deepgram error:', error);
          client.emit('error', { message: error.message });
        },
      );

      this.activeInterviews.set(data.interviewId, {
        socket: client,
        geminiSession,
        deepgramConnection,
        transcripts,
        templateQuestions,
        currentQuestionIndex: 0,
      });

      // Emit first question if available
      if (templateQuestions.length > 0) {
        client.emit('current-question', {
          question: templateQuestions[0],
          index: 0,
          total: templateQuestions.length,
        });
      }

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
      
      // Send audio to Deepgram for transcription
      if (session?.deepgramConnection) {
        const audioBuffer = Buffer.from(data.audio);
        this.deepgramService.sendAudio(session.deepgramConnection, audioBuffer);
      } else {
        // Fallback: if Deepgram is not available, use Gemini directly
        if (session?.geminiSession) {
          await this.geminiRealtimeService.sendAudio(
            session.geminiSession,
            data.audio,
          );
        }
      }
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('next-question')
  async handleNextQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; questionIndex: number },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session || !session.templateQuestions) {
        client.emit('error', { message: 'Session not found or no questions available' });
        return;
      }

      if (data.questionIndex >= session.templateQuestions.length) {
        client.emit('error', { message: 'No more questions' });
        return;
      }

      session.currentQuestionIndex = data.questionIndex;
      const question = session.templateQuestions[data.questionIndex];

      client.emit('current-question', {
        question,
        index: data.questionIndex,
        total: session.templateQuestions.length,
      });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('previous-question')
  async handlePreviousQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; questionIndex: number },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session || !session.templateQuestions) {
        client.emit('error', { message: 'Session not found or no questions available' });
        return;
      }

      if (data.questionIndex < 0) {
        client.emit('error', { message: 'Already at first question' });
        return;
      }

      session.currentQuestionIndex = data.questionIndex;
      const question = session.templateQuestions[data.questionIndex];

      client.emit('current-question', {
        question,
        index: data.questionIndex,
        total: session.templateQuestions.length,
      });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('complete-question')
  async handleCompleteQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; questionIndex: number },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session) {
        return;
      }

      client.emit('question-completed', { questionIndex: data.questionIndex });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('analyze-response')
  async handleAnalyzeResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; response: string },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session) {
        client.emit('error', { message: 'Session not found' });
        return;
      }

      // Get current question context
      const currentQuestion = session.templateQuestions?.[session.currentQuestionIndex || 0];
      
      // Analyze response quality (simplified - in production, use AI)
      const analysis = this.analyzeResponseQuality(data.response, currentQuestion?.question || '');

      client.emit('response-quality', analysis);
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }

  private analyzeResponseQuality(response: string, question: string): {
    completeness: number;
    relevance: number;
    clarity: number;
    suggestions?: string[];
  } {
    const words = response.split(/\s+/).length;
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    
    // Completeness: based on response length and structure
    const completeness = Math.min(100, Math.max(0, 
      (words > 20 ? 30 : 0) + 
      (sentences > 2 ? 30 : 0) + 
      (response.length > 100 ? 40 : 0)
    ));

    // Relevance: check for question keywords (simplified)
    const questionKeywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const responseLower = response.toLowerCase();
    const matchingKeywords = questionKeywords.filter(kw => responseLower.includes(kw)).length;
    const relevance = Math.min(100, (matchingKeywords / Math.max(1, questionKeywords.length)) * 100);

    // Clarity: based on sentence structure and length
    const avgSentenceLength = words / Math.max(1, sentences);
    const clarity = Math.min(100, Math.max(0,
      100 - Math.abs(avgSentenceLength - 15) * 2 // Optimal around 15 words per sentence
    ));

    const suggestions: string[] = [];
    if (completeness < 50) suggestions.push('Try to provide more detail in your answer');
    if (relevance < 50) suggestions.push('Focus more on directly addressing the question');
    if (clarity < 50) suggestions.push('Try to structure your answer more clearly');

    return { completeness, relevance, clarity, suggestions };
  }

  @SubscribeMessage('end-interview')
  async handleEndInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; transcript?: string; transcriptWithTimestamps?: any[] },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      
      // Close Gemini session
      if (session?.geminiSession) {
        await this.geminiRealtimeService.closeSession(session.geminiSession);
      }
      
      // Close Deepgram connection
      if (session?.deepgramConnection) {
        this.deepgramService.closeConnection(session.deepgramConnection);
      }

      // Collect transcripts from session or use provided data
      const transcripts = data.transcriptWithTimestamps || session?.transcripts || [];
      const transcriptText = data.transcript || transcripts.map(t => t.text).join(' ');

      // Complete the interview with transcript data
      if (transcriptText || transcripts.length > 0) {
        try {
          await this.interviewService.completeInterview(data.interviewId, {
            transcript: transcriptText,
            transcriptWithTimestamps: transcripts,
          });
        } catch (error: any) {
          console.error('Failed to complete interview:', error);
          // Still emit success to client, but log the error
        }
      }

      this.activeInterviews.delete(data.interviewId);
      client.emit('interview-ended', { success: true });
    } catch (error: any) {
      client.emit('error', { message: error.message });
    }
  }
}
