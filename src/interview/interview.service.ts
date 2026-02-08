import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Interview,
  InterviewStatus,
  InterviewLanguage,
  InterviewType,
  Prisma,
} from '@prisma/client';
import { GeminiService } from './services/gemini.service';
import { LiveInterviewDeepgramService } from './services/live-interview-deepgram.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { VideoProcessingService } from './services/video-processing.service';
import { EmailService } from '../email/email.service';
import { InterviewOptimizerService } from './services/interview-optimizer.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SchedulingService } from './services/scheduling.service';
import { AutomationService } from '../automation/automation.service';
import { MatchingService } from '../sourcing/services/matching.service';

@Injectable()
export class InterviewService {
  constructor(
    private prisma: PrismaService,
    private geminiService: GeminiService,
    private deepgramService: LiveInterviewDeepgramService,
    private r2Service: CloudflareR2Service,
    private videoProcessingService: VideoProcessingService,
    private emailService: EmailService,
    private optimizerService: InterviewOptimizerService,
    private notificationsGateway: NotificationsGateway,
    private schedulingService: SchedulingService,
    private automationService: AutomationService,
    private matchingService: MatchingService,
  ) {}

  async createInterview(
    createInterviewDto: CreateInterviewDto,
    clientId: string,
  ): Promise<Interview> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: createInterviewDto.candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: createInterviewDto.jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Daily.co is deprecated - no room creation needed for async interviews
    const dailyRoomId: string | null = null;

    // Determine initial status
    let status: InterviewStatus = InterviewStatus.scheduled;
    if (createInterviewDto.type === InterviewType.on_demand) {
      status = InterviewStatus.pending_candidate_response;
    }

    return await this.prisma.interview.create({
      data: {
        candidateId: createInterviewDto.candidateId,
        jobId: createInterviewDto.jobId,
        language: createInterviewDto.language,
        type: createInterviewDto.type || InterviewType.live,
        templateId: createInterviewDto.templateId,
        scheduledAt: createInterviewDto.scheduledAt,
        allowSelfScheduling: createInterviewDto.allowSelfScheduling || false,
        deadline: createInterviewDto.deadline,
        clientId,
        dailyRoomId,
        externalMeetingUrl: createInterviewDto.externalMeetingUrl,
        status,
      },
    });
  }

  // Deprecated - Daily.co token generation no longer needed
  async getInterviewToken(
    interviewId: string,
    userId: string,
  ): Promise<string> {
    throw new BadRequestException('Token-based interviews are deprecated. Use async interview flow instead.');
  }

  async startInterview(interviewId: string): Promise<Interview> {
    try {
      return await this.prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: InterviewStatus.in_progress,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      throw new NotFoundException('Interview not found');
    }
  }

  async uploadVideoRecording(
    interviewId: string,
    videoBuffer: Buffer,
  ): Promise<string> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const videoUrl = await this.r2Service.uploadVideo(interviewId, videoBuffer);
    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { videoUrl },
    });

    return videoUrl;
  }

  async completeInterview(
    interviewId: string,
    body: {
      transcript: string;
      transcriptWithTimestamps: any[];
      videoUrl?: string;
      conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date | string;
      }>;
    },
  ): Promise<Interview> {
    const { transcript, transcriptWithTimestamps, videoUrl } = body;
    
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { job: true, candidate: true },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    // Calculate multi-dimensional scores using Gemini
    // Include candidate profile and job data for proper cultural fit scoring
    const candidateProfile = {
      skills: interview.candidate.skills || [],
      experienceYears: interview.candidate.experienceYears ?? undefined,
      location: interview.candidate.location ?? undefined,
      profileData: interview.candidate.profileData,
    };
    
    const scores = await this.calculateDetailedScores(
      transcript,
      interview.job.description,
      interview.job.requiredSkills || [],
      candidateProfile,
      interview.job,
    );

    // Generate instant feedback
    const instantFeedback = this.optimizerService.generateInstantFeedback(scores);

    // Generate AI summary
    const summary = await this.geminiService.generateInterviewSummary(
      transcript,
      scores,
      interview.language,
    );

    // Format conversation history for database storage
    const formattedConversationHistory = body.conversationHistory
      ? body.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : msg.timestamp.toISOString(),
        }))
      : null;

    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.awaiting_review,
        completedAt: new Date(),
        transcript,
        transcriptWithTimestamps,
        conversationHistory: formattedConversationHistory as any,
        videoUrl: videoUrl || interview.videoUrl,
        scores: {
          ...scores,
          instantFeedback,
        } as any,
        aiSummary: summary,
      },
      include: {
        candidate: true,
        job: true,
        client: true,
      },
    });

    // Notify client that interview is ready for review
    this.notificationsGateway.notifyUser(interview.clientId, {
      title: 'Interview Ready for Review',
      description: `Interview with ${interview.candidate.firstName} ${interview.candidate.lastName} for ${interview.job.title} is ready for your review.`,
      type: 'info',
      href: `/dashboard/interviews/${interviewId}/review`,
    });

    // Trigger automation for interview_completed
    this.automationService.executeAutomation('interview_completed', {
      interviewId: interviewId,
      candidateId: interview.candidateId,
      candidateEmail: interview.candidate.email,
      candidateName: `${interview.candidate.firstName} ${interview.candidate.lastName}`,
      jobId: interview.jobId,
      jobTitle: interview.job.title,
      userId: interview.clientId,
      scores: scores,
      overallScore: scores.overall,
    }).catch(error => {
      console.error('Error executing automation for interview_completed:', error);
      // Don't throw - automation failure shouldn't break interview completion
    });

    return updatedInterview;
  }

  async getInterview(interviewId: string): Promise<Prisma.InterviewGetPayload<{
    include: {
      candidate: true;
      job: true;
      client: true;
      template: {
        include: {
          questions: true;
        };
      };
    };
  }>> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { 
        candidate: true, 
        job: true, 
        client: true,
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
      throw new NotFoundException('Interview not found');
    }

    return interview;
  }

  async getInterviewsByClient(clientId: string): Promise<Interview[]> {
    return await this.prisma.interview.findMany({
      where: { clientId },
      include: { candidate: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInterviewsByCandidateEmail(candidateEmail: string): Promise<Interview[]> {
    // Find candidate by email, then get their interviews
    const candidate = await this.prisma.candidate.findFirst({
      where: { email: candidateEmail },
    });

    if (!candidate) {
      return [];
    }

    return await this.prisma.interview.findMany({
      where: { candidateId: candidate.id },
      include: { candidate: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async scheduleInterview(
    interviewId: string,
    scheduledAt: Date,
    selectedDateIndex?: number,
  ): Promise<Interview> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    if (!interview.allowSelfScheduling) {
      throw new NotFoundException(
        'Self-scheduling not allowed for this interview',
      );
    }

    // Update dateOptions if provided
    let dateOptions = interview.dateOptions as any;
    if (
      selectedDateIndex !== undefined &&
      dateOptions &&
      Array.isArray(dateOptions)
    ) {
      dateOptions = dateOptions.map((opt: any, index: number) => ({
        ...opt,
        selected: index === selectedDateIndex,
      }));
    }

    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        scheduledAt,
        status: InterviewStatus.scheduled,
        dateOptions: dateOptions,
      },
      include: {
        candidate: true,
        job: true,
      },
    });

    // Send confirmation email with calendar invite
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const interviewUrl = interview.dailyRoomId
        ? `${frontendUrl}/interview/${interviewId}`
        : undefined;

      const candidateName =
        `${interview.candidate.firstName} ${interview.candidate.lastName}`.trim() ||
        'Candidate';

      await this.emailService.sendInterviewConfirmationWithCalendar(
        interview.candidate.email,
        candidateName,
        interview.job.title,
        scheduledAt,
        interviewUrl,
      );
    } catch (error: any) {
      console.error('Failed to send confirmation email:', error);
      // Don't throw - interview was scheduled successfully
    }

    return updatedInterview;
  }

  // Deprecated - Daily.co room creation no longer needed
  async startOnDemandInterview(
    interviewId: string,
  ): Promise<{ token: string; roomId: string }> {
    throw new BadRequestException('Daily.co interviews are deprecated. Use async interview flow instead.');
  }

  // Deprecated - Daily.co room creation no longer needed
  async createRoomForInterview(interviewId: string): Promise<Interview> {
    throw new BadRequestException('Daily.co room creation is deprecated. Use async interview flow instead.');
  }

  /**
   * Create a new interview session for async interview
   */
  async createInterviewSession(
    interviewId: string,
    userId: string,
  ): Promise<any> {
    try {
      const interview = await this.getInterview(interviewId);

      // Verify user has access
      // userId from JWT is the User.id (not Candidate.id)
      // For candidates: they might not have User accounts, so we allow access if they have the interview link
      // For clients/interviewers: userId should match clientId
      const isClient = interview.clientId === userId;
      
      // For candidates, we'll allow access since they're accessing via interview link
      // In production, you might want to add token-based access or email verification
      if (!isClient) {
        // Log for security monitoring
        console.log(`Candidate accessing interview ${interviewId} - candidateId: ${interview.candidateId}`);
        // Allow candidate access (they have the interview link, which serves as authorization)
      }

      // Check if interview is scheduled and if it's time yet
      if (interview.scheduledAt) {
        const now = new Date();
        const scheduledTime = new Date(interview.scheduledAt);
        const timeDiff = scheduledTime.getTime() - now.getTime();
        
        const fiveMinutesBefore = 5 * 60 * 1000;
        const twoHoursAfter = 2 * 60 * 60 * 1000;
        
        if (timeDiff > fiveMinutesBefore) {
          const minutesUntil = Math.ceil(timeDiff / (60 * 1000));
          throw new BadRequestException(
            `Interview is scheduled for ${scheduledTime.toLocaleString()}. Please join 5 minutes before (${minutesUntil} minutes remaining).`,
          );
        }
        
        if (timeDiff < -twoHoursAfter) {
          throw new BadRequestException('This interview has expired. Please contact the recruiter to reschedule.');
        }
      }

      // Check if session already exists for this interview
      const existingSession = await this.prisma.interviewSession.findFirst({
        where: {
          interviewId,
          status: 'in_progress',
        },
      });

      if (existingSession) {
        // Return existing session instead of creating a new one
        return existingSession;
      }

      // Update interview status
      await this.prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: InterviewStatus.in_progress,
          startedAt: new Date(),
        },
      });

      // Create session
      const session = await this.prisma.interviewSession.create({
        data: {
          interviewId,
          status: 'in_progress',
          currentQuestionIndex: 0,
        },
      });

      return session;
    } catch (error: any) {
      console.error('Error creating interview session:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      // Check for Prisma errors
      if (error.code === 'P2002') {
        throw new BadRequestException('Session already exists for this interview');
      }
      
      if (error.code === 'P2003') {
        throw new BadRequestException('Invalid interview reference');
      }
      
      if (error.code === 'P2021') {
        throw new BadRequestException(
          'Database tables not found. Please run: npx prisma db push',
        );
      }
      
      // Wrap unknown errors with more details
      throw new BadRequestException(
        `Failed to create interview session: ${error.message || 'Unknown error'}. Please ensure Prisma Client is regenerated and database schema is up to date.`,
      );
    }
  }

  /**
   * Generate presigned upload URL for video answer
   */
  async generateUploadUrl(
    interviewId: string,
    sessionId: string,
    userId: string,
  ): Promise<{ url: string; key: string; questionId?: string }> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { interview: true },
    });

    if (!session || session.interviewId !== interviewId) {
      throw new NotFoundException('Session not found');
    }

    // Get current question
    const interview = await this.getInterview(interviewId);
    const questions = interview.template?.questions || [];
    const currentQuestion = questions[session.currentQuestionIndex];

    if (!currentQuestion) {
      throw new BadRequestException('No more questions available');
    }

    const { url, key } = await this.r2Service.generatePresignedUploadUrl(
      interviewId,
      currentQuestion.id,
      'video/webm',
      3600, // 1 hour expiry
    );

    return { url, key, questionId: currentQuestion.id };
  }

  /**
   * Complete an answer and trigger async processing
   */
  async completeAnswer(
    interviewId: string,
    sessionId: string,
    questionId: string,
    videoKey: string,
    userId: string,
  ): Promise<any> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { interview: true },
    });

    if (!session || session.interviewId !== interviewId) {
      throw new NotFoundException('Session not found');
    }

    const interview = await this.getInterview(interviewId);
    const questions = interview.template?.questions || [];
    const question = questions.find((q) => q.id === questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    // Get video duration
    const duration = await this.videoProcessingService.getVideoDuration(videoKey);

    // Create answer record
    const answer = await this.prisma.interviewAnswer.create({
      data: {
        sessionId,
        questionId,
        questionText: question.question,
        questionType: question.type,
        videoUrl: this.r2Service.getPublicUrl(videoKey),
        duration,
      },
    });

    // Trigger async processing (don't await - process in background)
    this.processAnswerAsync(interviewId, sessionId, answer.id, videoKey, interview.language)
      .catch((error) => {
        console.error('Error processing answer:', error);
      });

    return answer;
  }

  /**
   * Process answer asynchronously: extract audio, transcribe, evaluate
   */
  private async processAnswerAsync(
    interviewId: string,
    sessionId: string,
    answerId: string,
    videoKey: string,
    language: string,
  ): Promise<void> {
    try {
      // Extract audio from video
      const audioKey = await this.videoProcessingService.extractAudioFromVideo(
        videoKey,
        interviewId,
      );

      // Update answer with audio URL
      await this.prisma.interviewAnswer.update({
        where: { id: answerId },
        data: { audioUrl: this.r2Service.getPublicUrl(audioKey) },
      });

      // Transcribe audio using Deepgram
      const transcript = await this.deepgramService.transcribeAudioFile(
        audioKey,
        language,
      );

      // Update answer with transcript
      await this.prisma.interviewAnswer.update({
        where: { id: answerId },
        data: { transcript },
      });

      // Get interview context for evaluation
      const interview = await this.getInterview(interviewId);
      const jobDescription = interview.job?.description || '';

      // Evaluate answer using Gemini
      const evaluation = await this.geminiService.evaluateResponse(
        (await this.prisma.interviewAnswer.findUnique({ where: { id: answerId } }))?.questionText || '',
        transcript,
        jobDescription,
        language,
      );

      // Update answer with evaluation
      await this.prisma.interviewAnswer.update({
        where: { id: answerId },
        data: {
          evaluation: evaluation as any,
          scores: {
            overall: evaluation.score,
            technical: evaluation.technicalScore || evaluation.score,
            communication: evaluation.communicationScore || evaluation.score,
            relevance: evaluation.relevanceScore || evaluation.score,
          },
          processedAt: new Date(),
        },
      });
    } catch (error: any) {
      console.error(`Failed to process answer ${answerId}:`, error);
      // Update answer with error status
      await this.prisma.interviewAnswer.update({
        where: { id: answerId },
        data: {
          evaluation: { error: error.message } as any,
        },
      });
    }
  }

  /**
   * Get next question for the interview session
   */
  async getNextQuestion(
    interviewId: string,
    sessionId: string,
    userId: string,
    skipGreeting: boolean = false,
  ): Promise<{ question: any; isComplete: boolean; isGreeting?: boolean; totalQuestions?: number }> {
    try {
      const session = await this.prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: {
          interview: true,
          answers: {
            orderBy: { recordedAt: 'asc' },
          },
        },
      });

      if (!session || session.interviewId !== interviewId) {
        throw new NotFoundException('Session not found');
      }

      const interview = await this.getInterview(interviewId);
      console.log('interview', interview);
      const questions = interview.template?.questions || [];

      console.log('getNextQuestion - Debug:', {
        interviewId,
        sessionId,
        hasTemplate: !!interview.template,
        questionsCount: questions.length,
        currentQuestionIndex: session.currentQuestionIndex,
        answersCount: session.answers.length,
      });

    // Only complete interview if:
    // 1. All questions have been answered (currentQuestionIndex >= questions.length)
    // 2. There are actually questions to answer (questions.length > 0)
    // 3. There are answers recorded (session.answers.length > 0)
    if (
      questions.length > 0 &&
      session.currentQuestionIndex >= questions.length &&
      session.answers.length > 0
    ) {
      // All questions answered - complete session
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Complete interview only if we have transcript data
      const transcript = session.answers
        .map((a) => a.transcript || '')
        .filter((t) => t.trim().length > 0)
        .join(' ');

      if (transcript.trim().length > 0) {
        await this.completeInterview(interviewId, {
          transcript,
          transcriptWithTimestamps: session.answers.map((a) => ({
            text: a.transcript || '',
            timestamp: a.recordedAt.getTime(),
          })),
        });
      }

      return { question: null, isComplete: true };
    }

    // If no questions exist, return error
    if (questions.length === 0) {
      throw new BadRequestException(
        'No questions found for this interview. Please add questions to the interview template.',
      );
    }

    // Check if this is the first question (greeting phase)
    // Show greeting only if: at index 0, no answers, and not skipping greeting
    if (
      !skipGreeting &&
      session.currentQuestionIndex === 0 &&
      session.answers.length === 0
    ) {
      // Generate greeting
      const candidateName = `${interview.candidate.firstName} ${interview.candidate.lastName}`;
      const jobTitle = interview.job?.title || 'this position';
      const totalQuestions = questions.length;

      let greetingMessage: string;
      if (this.geminiService.isGeminiAvailable()) {
        // Use Gemini to generate personalized greeting
        try {
          greetingMessage = await this.geminiService.generateGreeting(
            candidateName,
            jobTitle,
            totalQuestions,
            interview.language || 'en',
          );
        } catch (error) {
          console.error('Failed to generate greeting with Gemini:', error);
          // Fallback to simple greeting
          greetingMessage = `Hello ${candidateName}! Welcome to your interview for ${jobTitle}. We'll ask you ${totalQuestions} question${totalQuestions > 1 ? 's' : ''}. Take your time and answer thoughtfully. Ready to begin?`;
        }
      } else {
        // Simple greeting if Gemini is not available
        greetingMessage = `Hello ${candidateName}! Welcome to your interview for ${jobTitle}. We'll ask you ${totalQuestions} question${totalQuestions > 1 ? 's' : ''}. Take your time and answer thoughtfully. Ready to begin?`;
      }

      return {
        question: {
          id: 'greeting',
          question: greetingMessage,
          type: 'greeting',
          order: 0,
        },
        isComplete: false,
        isGreeting: true,
        totalQuestions: totalQuestions,
      };
    }

    // Check if currentQuestionIndex is valid
    if (session.currentQuestionIndex < 0 || session.currentQuestionIndex >= questions.length) {
      throw new BadRequestException(
        `Invalid question index: ${session.currentQuestionIndex}. Total questions: ${questions.length}`,
      );
    }

    // Get current question
    const currentQuestion = questions[session.currentQuestionIndex];
    
    if (!currentQuestion) {
      throw new BadRequestException(
        `Question at index ${session.currentQuestionIndex} not found.`,
      );
    }

    // Check if we should ask a follow-up based on last answer
    const lastAnswer = session.answers[session.answers.length - 1];
    let shouldFollowUp = false;
    let nextQuestion = currentQuestion;

    if (lastAnswer && lastAnswer.transcript) {
      // Use Gemini to decide if follow-up is needed
      try {
        const context = {
          jobDescription: interview.job?.description || '',
          jobTitle: interview.job?.title || '',
          requiredSkills: interview.job?.requiredSkills || [],
          candidateName: `${interview.candidate.firstName} ${interview.candidate.lastName}`,
          candidateSkills: interview.candidate.skills || [],
          previousQuestions: session.answers.map((a) => a.questionText),
          previousAnswers: session.answers.map((a) => a.transcript || ''),
          currentQuestionIndex: session.currentQuestionIndex,
          totalQuestions: questions.length,
        };

        const geminiResponse = await this.geminiService.generateNextQuestion(
          context,
          interview.language,
        );

        if (geminiResponse.shouldFollowUp) {
          shouldFollowUp = true;
          nextQuestion = {
            ...currentQuestion,
            question: geminiResponse.question,
          };
        } else {
          // Move to next question
          await this.prisma.interviewSession.update({
            where: { id: sessionId },
            data: { currentQuestionIndex: session.currentQuestionIndex + 1 },
          });
        }
      } catch (error) {
        console.error('Error generating next question:', error);
        // Fallback: move to next question
        await this.prisma.interviewSession.update({
          where: { id: sessionId },
          data: { currentQuestionIndex: session.currentQuestionIndex + 1 },
        });
      }
    }

      return {
        question: nextQuestion,
        isComplete: false,
        totalQuestions: questions.length,
      };
    } catch (error: any) {
      console.error('Error in getNextQuestion:', {
        interviewId,
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new BadRequestException(
        `Failed to get next question: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Calculate detailed multi-dimensional scores
   * Now includes proper cultural fit scoring algorithm
   */
  async calculateDetailedScores(
    transcript: string,
    jobDescription: string,
    requiredSkills: string[],
    candidateProfile?: {
      skills?: string[];
      experienceYears?: number;
      location?: string;
      profileData?: any;
    },
    job?: any, // Job object for cultural fit calculation
  ): Promise<{
    technical: number;
    communication: number;
    problemSolving: number;
    culturalFit: number;
    overall: number;
  }> {
    try {
      // Use evaluateResponse for complete interview evaluation
      const evaluation = await this.geminiService.evaluateResponse(
        'Complete Interview',
        transcript,
        jobDescription,
        'en',
      );
      
      // Calculate multi-dimensional scores from evaluation
      const technical = evaluation.score || 75;
      
      // Communication score (based on transcript quality and clarity)
      const communication = Math.min(
        100,
        technical +
          (transcript.length > 500 ? 5 : 0) + // Longer responses = better communication
          (transcript.split('.').length > 10 ? 5 : 0), // Well-structured = better
      );

      // Problem-solving score (analyze approach in transcript)
      const problemSolving = Math.min(
        100,
        technical -
          5 +
          (transcript.toLowerCase().includes('step') ? 5 : 0) +
          (transcript.toLowerCase().includes('analyze') ? 5 : 0) +
          (transcript.toLowerCase().includes('solution') ? 5 : 0),
      );

      // Cultural Fit - Use proper algorithm (similar to technical skill matching)
      let culturalFit: number;
      if (candidateProfile && job) {
        // Use AI-enhanced cultural fit scoring if available
        culturalFit = await this.matchingService.calculateCulturalFitWithAI(
          transcript,
          jobDescription,
          candidateProfile,
          job,
        );
      } else if (candidateProfile) {
        // Use rule-based scoring if job data not available
        culturalFit = this.matchingService.calculateCulturalFitScore(
          candidateProfile,
          job || ({} as any),
          transcript,
        );
      } else {
        // Fallback: estimate from transcript
        culturalFit = Math.min(100, technical);
      }

      // Calculate weighted overall score
      const overall = Math.round(
        technical * 0.4 +
          communication * 0.25 +
          problemSolving * 0.2 +
          culturalFit * 0.15,
      );

      return {
        technical,
        communication,
        problemSolving,
        culturalFit,
        overall,
      };
    } catch (error: any) {
      console.error('Failed to calculate detailed scores:', error);
      // Fallback to simplified scoring
      return {
        technical: 75,
        communication: 80,
        problemSolving: 70,
        culturalFit: 70,
        overall: 74,
      };
    }
  }

  /**
   * Review interview and optionally schedule next round
   */
  async reviewInterview(
    interviewId: string,
    reviewerId: string,
    reviewData: {
      reviewStatus: 'approved' | 'rejected' | 'needs_revision' | 'schedule_next_round';
      humanNotes?: string;
      humanScores?: {
        technical?: number;
        communication?: number;
        problemSolving?: number;
        culturalFit?: number;
        overall?: number;
      };
      nextInterviewData?: {
        scheduledAt?: Date;
        allowSelfScheduling?: boolean;
        deadline?: Date;
        templateId?: string;
        type?: InterviewType;
        language?: InterviewLanguage;
      };
    },
  ): Promise<{ interview: Interview; nextInterview?: Interview }> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    if (interview.status !== InterviewStatus.awaiting_review) {
      throw new BadRequestException(
        `Interview is not awaiting review. Current status: ${interview.status}`,
      );
    }

    // Handle "schedule_next_round" - create new interview
    let nextInterview: Interview | undefined;
    if (reviewData.reviewStatus === 'schedule_next_round') {
      if (!reviewData.nextInterviewData) {
        throw new BadRequestException(
          'nextInterviewData is required when scheduling next round',
        );
      }

      // Calculate next round number
      const currentRound = interview.roundNumber || 1;
      const nextRound = currentRound + 1;

      // Daily.co is deprecated - no room creation needed
      const dailyRoomId: string | null = null;

      // Determine initial status for next interview
      let nextInterviewStatus: InterviewStatus = InterviewStatus.scheduled;
      if (reviewData.nextInterviewData.type === InterviewType.on_demand) {
        nextInterviewStatus = InterviewStatus.pending_candidate_response;
      }

      // Generate date options if self-scheduling is enabled
      let dateOptions: any = null;
      if (reviewData.nextInterviewData.allowSelfScheduling) {
        dateOptions = this.schedulingService.generateDateOptions({
          daysAhead: [3, 5, 7],
          timezone: interview.job.timezone || 'UTC',
        });
      }

      // Create next interview
      nextInterview = await this.prisma.interview.create({
        data: {
          candidateId: interview.candidateId,
          jobId: interview.jobId,
          clientId: interview.clientId,
          language: reviewData.nextInterviewData.language || interview.language,
          type: reviewData.nextInterviewData.type || InterviewType.live,
          templateId: reviewData.nextInterviewData.templateId || interview.templateId,
          scheduledAt: reviewData.nextInterviewData.scheduledAt,
          allowSelfScheduling: reviewData.nextInterviewData.allowSelfScheduling || false,
          deadline: reviewData.nextInterviewData.deadline,
          dailyRoomId,
          status: nextInterviewStatus,
          roundNumber: nextRound,
          dateOptions,
        },
      });

      // Send invitation email for next interview
      if (reviewData.nextInterviewData.allowSelfScheduling && dateOptions) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const scheduleUrl = `${frontendUrl}/interview/${nextInterview.id}/schedule`;
        // Convert DateOption[] to string[] for email service
        const dateStrings = Array.isArray(dateOptions)
          ? dateOptions.map((opt: any) => opt.date || opt)
          : [];
        await this.emailService.sendInterviewInvitationWithDates(
          interview.candidate.email,
          `${interview.candidate.firstName} ${interview.candidate.lastName}`,
          interview.job.title,
          nextInterview.id,
          dateStrings,
          interview.candidate.id, // Pass candidateId
          interview.candidate.resumeUrl, // Pass resumeUrl
          undefined, // No password for next round (user should already exist)
        );
      } else if (nextInterview.scheduledAt) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const interviewUrl = nextInterview.dailyRoomId
          ? `${frontendUrl}/interview/${nextInterview.id}`
          : undefined;
        await this.emailService.sendInterviewConfirmationWithCalendar(
          interview.candidate.email,
          `${interview.candidate.firstName} ${interview.candidate.lastName}`,
          interview.job.title,
          nextInterview.scheduledAt,
          interviewUrl,
        );
      }

      // Notify candidate about next round
      this.notificationsGateway.notifyUser(interview.candidateId, {
        title: 'Next Round Interview Scheduled',
        description: `You have been invited for Round ${nextRound} interview for ${interview.job.title}`,
        type: 'info',
        href: `/interview/${nextInterview.id}`,
      });
    }

    // Determine final status based on review
    let finalStatus: InterviewStatus;
    if (reviewData.reviewStatus === 'approved') {
      finalStatus = InterviewStatus.completed;
    } else if (reviewData.reviewStatus === 'rejected') {
      finalStatus = InterviewStatus.completed;
    } else if (reviewData.reviewStatus === 'schedule_next_round') {
      finalStatus = InterviewStatus.completed; // Mark current interview as completed
    } else {
      // needs_revision - keep as awaiting_review
      finalStatus = InterviewStatus.awaiting_review;
    }

    // Merge human scores with AI scores if provided
    const currentScores = (interview.scores as any) || {};
    const finalScores = reviewData.humanScores
      ? {
          ...currentScores,
          ...reviewData.humanScores,
          overall:
            reviewData.humanScores.overall ||
            Math.round(
              (reviewData.humanScores.technical || currentScores.technical || 0) * 0.4 +
                (reviewData.humanScores.communication ||
                  currentScores.communication ||
                  0) *
                  0.25 +
                (reviewData.humanScores.problemSolving ||
                  currentScores.problemSolving ||
                  0) *
                  0.2 +
                (reviewData.humanScores.culturalFit ||
                  currentScores.culturalFit ||
                  0) *
                  0.15,
            ),
        }
      : currentScores;

    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: finalStatus,
        // Note: reviewedBy, reviewedAt, humanNotes, humanScores, reviewStatus fields
        // are not in the schema. Store review data in scores JSON field if needed.
        scores: finalScores as any,
      },
      include: {
        candidate: true,
        job: true,
        client: true,
      },
    });

    return {
      interview: updatedInterview,
      nextInterview,
    };
  }
}
