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
import { WhisperService } from '../services/whisper.service';
import { AiRouterService } from '../services/ai-router.service';
import { InterviewService } from '../interview.service';
import { DailyService } from '../services/daily.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
@WebSocketGateway({
  transport: ['polling', 'websocket'],
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
      audioBuffer: Buffer[];
      transcripts: Array<{ text: string; timestamp: number; language: string }>;
      templateQuestions?: Array<{ id: string; question: string; type: string; order: number; timeLimit?: number }>;
      currentQuestionIndex?: number;
      language: string;
      jobTitle?: string;
      jobDescription?: string;
      candidateResumeSummary?: string;
      resumeFollowUpCount?: number;
    }
  >();

  private readonly MAX_RESUME_FOLLOW_UPS = 4;

  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly RECONNECT_GRACE_MS = 30000;

  constructor(
    private jwtService: JwtService,
    private geminiRealtimeService: GeminiRealtimeService,
    private whisperService: WhisperService,
    private aiRouter: AiRouterService,
    private interviewService: InterviewService,
    private dailyService: DailyService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      let payload: { sub: string; exp?: number };
      try {
        payload = this.jwtService.verify(token) as { sub: string; exp?: number };
      } catch (err: any) {
        if (err?.name === 'TokenExpiredError') {
          const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
          const decoded = jwt.verify(token, secret, { ignoreExpiration: true }) as { sub: string; exp?: number };
          const nowSec = Math.floor(Date.now() / 1000);
          const exp = decoded.exp ?? 0;
          if (nowSec - exp <= 300) {
            payload = decoded;
            console.log(`Client reconnected with recently expired token (within 5 min grace)`);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

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
    if (!interviewId || !this.activeInterviews.has(interviewId)) {
      console.log(`Client disconnected: ${client.data.userId}`);
      return;
    }
    const existing = this.disconnectTimers.get(interviewId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(interviewId);
      const session = this.activeInterviews.get(interviewId);
      if (session?.geminiSession) {
        this.geminiRealtimeService.closeSession(session.geminiSession);
      }
      this.activeInterviews.delete(interviewId);
      console.log(`[Interview ${interviewId}] Session closed after grace period`);
    }, this.RECONNECT_GRACE_MS);
    this.disconnectTimers.set(interviewId, timer);
    console.log(`Client disconnected: ${client.data.userId} (reconnect grace ${this.RECONNECT_GRACE_MS / 1000}s)`);
  }

  @SubscribeMessage('start-interview')
  async handleStartInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; language: string },
  ) {
    try {
      const existingSession = this.activeInterviews.get(data.interviewId);
      const hadDisconnectTimer = this.disconnectTimers.has(data.interviewId);
      if (existingSession && hadDisconnectTimer) {
        clearTimeout(this.disconnectTimers.get(data.interviewId)!);
        this.disconnectTimers.delete(data.interviewId);
        existingSession.socket = client;
        if (existingSession.templateQuestions?.length) {
          client.emit('template-questions', { questions: existingSession.templateQuestions });
          client.emit('current-question', {
            question: existingSession.templateQuestions[existingSession.currentQuestionIndex ?? 0],
            index: existingSession.currentQuestionIndex ?? 0,
            total: existingSession.templateQuestions.length,
          });
        }
        client.emit('interview-started', { success: true });
        console.log(`[Interview ${data.interviewId}] Reconnected, session reattached`);
        return;
      }
      if (existingSession && !hadDisconnectTimer) {
        client.emit('interview-started', { success: true });
        // Re-send first question so frontend can show it if they missed it (e.g. "AI not starting")
        const firstQ = existingSession.templateQuestions?.[0]?.question ?? 'Tell me about yourself and your relevant experience.';
        client.emit('ai-message', { message: `Hello, thank you for joining. ${firstQ}` });
        return;
      }

      const transcripts: Array<{ text: string; timestamp: number; language: string }> = [];

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
          // AI response: emit only ai-message so frontend shows one row (no duplicate with transcript)
          transcripts.push({
            text: transcript.text,
            timestamp: transcript.timestamp || Date.now(),
            language: transcript.language || data.language,
          });
          client.emit('ai-message', { message: transcript.text });
        },
        (audioChunk) => {
          // Send AI audio response to client
          client.emit('audio-response', audioChunk);
        },
      );

      const candidateResumeSummary = [
        interview.candidate?.resumeUrl ? 'Resume on file.' : '',
        (interview.candidate?.skills as string[])?.length
          ? `Skills: ${(interview.candidate.skills as string[]).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' ') || 'No resume details.';

      // Session uses audio buffer for Whisper; transcription triggered by client (transcribe-now)
      this.activeInterviews.set(data.interviewId, {
        socket: client,
        geminiSession,
        audioBuffer: [],
        transcripts,
        templateQuestions,
        currentQuestionIndex: 0,
        language: data.language,
        jobTitle: jobTitle || undefined,
        jobDescription: jobDescription ? jobDescription.slice(0, 800) : undefined,
        candidateResumeSummary: candidateResumeSummary || undefined,
        resumeFollowUpCount: 0,
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

      // Send first AI message as soon as possible so frontend does not stay on "Waiting for AI to start"
      // First reply: OpenAI then Gemini (so interview starts even if Gemini fails)
      const firstQuestionText =
        templateQuestions.length > 0
          ? templateQuestions[0].question
          : 'Tell me about yourself and your relevant experience.';
      const initialPrompt = candidateName && candidateName !== 'Candidate'
        ? `The candidate ${candidateName} has just joined the interview. Greet them by name (${candidateName}) briefly in one sentence, then ask this first question: "${firstQuestionText}"`
        : `The candidate has just joined the interview. Greet them briefly in one sentence, then ask this first question: "${firstQuestionText}"`;

      let firstReplyText: string;
      try {
        const replyResult = await this.aiRouter.getNextReply(
          initialPrompt,
          data.language,
          geminiSession,
        );
        firstReplyText = replyResult?.text?.trim() || `Hello${candidateName && candidateName !== 'Candidate' ? ` ${candidateName}` : ''}. ${firstQuestionText}`;
      } catch (err: any) {
        console.error('AI first question failed (OpenAI + Gemini fallback):', err);
        firstReplyText = `Hello${candidateName && candidateName !== 'Candidate' ? ` ${candidateName}` : ''}. ${firstQuestionText}`;
      }
      client.emit('ai-message', { message: firstReplyText });

      // Optional: have Gemini speak the same text (TTS)
      const sayPrompt = `Say exactly the following to the candidate. Do not add anything else: ${firstReplyText}`;
      this.geminiRealtimeService.sendText(geminiSession, sayPrompt).catch((err) => {
        console.warn('Gemini TTS for first question failed (text already shown):', err?.message);
      });
    } catch (error: any) {
      console.error('[Interview start failed]', error?.message ?? error);
      client.emit('interview-started', { success: true });
      client.emit('ai-message', {
        message: 'Welcome. Please tell me about yourself and your relevant experience.',
      });
      client.emit('error', { message: error?.message ?? 'Interview start failed' });
    }
  }

  @SubscribeMessage('audio-chunk')
  async handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; audio: ArrayBuffer },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (session?.audioBuffer) {
        session.audioBuffer.push(Buffer.from(data.audio));
      }
    } catch (error: any) {
      client.emit('error', { message: error?.message ?? 'Request failed' });
    }
  }

  @SubscribeMessage('transcribe-now')
  async handleTranscribeNow(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; audio?: ArrayBuffer },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session?.geminiSession) {
        client.emit('transcript', { text: '', isFinal: true, speaker: 'candidate' });
        return;
      }

      const hasPayload = data.audio != null && (data.audio as ArrayBuffer).byteLength > 0;
      const hasBuffer = (session.audioBuffer?.length ?? 0) > 0;
      if (!hasPayload && !hasBuffer) {
        client.emit('transcript', { text: '', isFinal: true, speaker: 'candidate' });
        return;
      }

      const audioForWhisper = hasPayload
        ? Buffer.from(data.audio as ArrayBuffer)
        : Buffer.concat(session.audioBuffer);
      if (!hasPayload) session.audioBuffer = [];

      let text = '';
      try {
        const result = await this.whisperService.transcribe(audioForWhisper, {
          language: session.language?.slice(0, 2),
        });
        text = result.text?.trim() ?? '';
      } catch (err: any) {
        console.error('Whisper transcription error:', err);
        client.emit('error', { message: err?.message ?? 'Transcription failed' });
        return;
      }

      const timestamp = Date.now();
      if (text) {
        const transcript = { text, timestamp, language: session.language };
        session.transcripts.push(transcript);
        client.emit('transcript', {
          text,
          timestamp,
          language: session.language,
          isFinal: true,
          speaker: 'candidate',
        });
      } else {
        client.emit('transcription-failed', {
          message: 'Could not transcribe your speech. Try speaking again and click "Done speaking", or type your answer in the chat below.',
        });
        return;
      }

      const questions = session.templateQuestions ?? [];
      const idx = session.currentQuestionIndex ?? 0;
      const nextIndex = idx + 1;
      const hasNextTemplate = nextIndex < questions.length;
      const nextQuestion = hasNextTemplate ? questions[nextIndex] : null;
      const currentQuestion = session.templateQuestions?.[idx];

      // Advance to next question and update UI immediately so user sees "next question" right after answering
      if (hasNextTemplate) {
        session.currentQuestionIndex = nextIndex;
        client.emit('current-question', {
          question: nextQuestion!,
          index: nextIndex,
          total: questions.length,
        });
        client.emit('question-completed', { questionIndex: idx });
      }

      // Response quality in background so it doesn't block the next question
      if (currentQuestion) {
        this.aiRouter.evaluateResponse(currentQuestion.question, text).then((analysis) => {
          client.emit('response-quality', analysis);
        }).catch((err) => {
          console.warn('evaluateResponse failed:', err?.message);
        });
      }

      const resumeCount = session.resumeFollowUpCount ?? 0;
      const canAskResumeFollowUp =
        !hasNextTemplate &&
        resumeCount < this.MAX_RESUME_FOLLOW_UPS &&
        (session.jobTitle || session.jobDescription || session.candidateResumeSummary);

      let promptForAI: string;
      if (hasNextTemplate && nextQuestion) {
        promptForAI = `The candidate just answered this question: "${currentQuestion?.question ?? 'the last question'}". Their answer: "${text}". Briefly acknowledge their answer in one short sentence, then ask the next interview question: "${nextQuestion.question}". Do not repeat the question number; just ask it naturally.`;
      } else if (canAskResumeFollowUp) {
        session.resumeFollowUpCount = resumeCount + 1;
        const jobContext = [
          session.jobTitle ? `Job: ${session.jobTitle}.` : '',
          session.jobDescription ? `Job description (excerpt): ${session.jobDescription}` : '',
          session.candidateResumeSummary ? `Candidate: ${session.candidateResumeSummary}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        promptForAI = `The candidate just gave their answer: "${text}". You have the following context: ${jobContext}. Briefly acknowledge what they said in one short sentence, then ask ONE specific follow-up question about their experience, skills, or background that is relevant to the job. Do NOT conclude the interview. Do NOT say "that concludes" or "thank you for your time" yet. Just ask one natural interview question.`;
      } else {
        promptForAI = `The candidate just answered this question: "${currentQuestion?.question ?? 'the question'}". Their answer: "${text}". Briefly acknowledge their answer, then thank them and conclude the interview (say we're done and thank them for their time). Say this only once.`;
      }

      const isConclusion = !hasNextTemplate && !canAskResumeFollowUp;

      let nextReplyText: string;
      try {
        const replyResult = await this.aiRouter.getNextReply(
          promptForAI,
          session.language,
          session.geminiSession,
        );
        nextReplyText = replyResult?.text?.trim() || '';
      } catch (err: any) {
        console.error('getNextReply failed:', err?.message);
        nextReplyText =
          hasNextTemplate && nextQuestion
            ? `Thank you. ${nextQuestion.question}`
            : canAskResumeFollowUp
              ? 'Thank you. Could you tell me more about your relevant experience?'
              : 'Thank you for your answer. That concludes our interview—we appreciate your time.';
      }
      if (!nextReplyText) {
        nextReplyText =
          hasNextTemplate && nextQuestion
            ? `Thank you. ${nextQuestion.question}`
            : 'Thank you. Could you tell me more about your experience?';
      }
      // Emit next question to client immediately so UI advances (do not wait for TTS)
      client.emit('ai-message', { message: nextReplyText });
      if (isConclusion) {
        client.emit('interview-concluded', { message: 'Interview concluded. Ending automatically.' });
      }
      // Optional: have Gemini speak it
      const sayPrompt = `Say exactly the following to the candidate. Do not add anything else: ${nextReplyText}`;
      this.geminiRealtimeService.sendText(session.geminiSession, sayPrompt).catch((error) => {
        console.warn('Gemini TTS error:', error?.message);
      });
    } catch (error: any) {
      console.error('handleTranscribeNow error:', error?.message);
      client.emit('error', { message: error?.message ?? 'Transcription failed' });
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
      client.emit('error', { message: error?.message ?? 'Request failed' });
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
      client.emit('error', { message: error?.message ?? 'Request failed' });
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
      client.emit('error', { message: error?.message ?? 'Request failed' });
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

      const currentQuestion = session.templateQuestions?.[session.currentQuestionIndex || 0];
      const analysis = await this.aiRouter.evaluateResponse(
        currentQuestion?.question || '',
        data.response,
      );
      client.emit('response-quality', analysis);
    } catch (error: any) {
      client.emit('error', { message: error?.message ?? 'Request failed' });
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; message: string },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      if (!session?.geminiSession) {
        client.emit('error', { message: 'Interview session not ready yet' });
        return;
      }
      if (!data.message?.trim()) return;
      this.geminiRealtimeService
        .sendText(session.geminiSession, data.message.trim())
        .catch((err) => {
          console.error('send-message: Gemini error:', err);
          client.emit('error', { message: 'Failed to send message to interviewer' });
        });
    } catch (error: any) {
      client.emit('error', { message: error?.message ?? 'Request failed' });
    }
  }

  @SubscribeMessage('join-ai-to-room')
  async handleJoinAiToRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { interviewId: string; dailyRoomId: string; language: string },
  ) {
    try {
      // Acknowledge immediately so frontend does not show "no response" error
      client.emit('ai-join-request-received');

      const { dailyRoomId } = data;
      if (!dailyRoomId) {
        client.emit('ai-joined-room', {
          message: 'AI join requested but no room ID provided',
        });
        return;
      }

      const dailyDomain =
        process.env.DAILY_MEETING_DOMAIN ||
        process.env.DAILY_DOMAIN ||
        'staffenza';
      const roomUrl = `https://${dailyDomain}.daily.co/${dailyRoomId}`;

      try {
        const token = await this.dailyService.getRoomToken(dailyRoomId, 'ai-interviewer');
        client.emit('ai-joined-room', {
          message: 'AI can join the video room',
          token,
          roomUrl,
          dailyRoomId,
        });
      } catch (tokenError: any) {
        console.warn('Could not create Daily token for AI participant:', tokenError?.message);
        client.emit('ai-joined-room', {
          message: 'AI join requested; token not available (check DAILY_API_KEY)',
          roomUrl,
          dailyRoomId,
        });
      }
    } catch (error: any) {
      client.emit('ai-join-request-received');
      client.emit('error', { message: error?.message || 'Failed to process AI join request' });
    }
  }

  @SubscribeMessage('end-interview')
  async handleEndInterview(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { interviewId: string; transcript?: string; transcriptWithTimestamps?: any[] },
  ) {
    try {
      const session = this.activeInterviews.get(data.interviewId);
      
      if (session?.geminiSession) {
        await this.geminiRealtimeService.closeSession(session.geminiSession);
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
      client.emit('error', { message: error?.message ?? 'Request failed' });
    }
  }
}
