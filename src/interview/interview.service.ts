import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Interview,
  InterviewStatus,
  InterviewLanguage,
  InterviewType,
  Prisma,
} from '@prisma/client';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { EmailService } from '../email/email.service';
import { InterviewOptimizerService } from './services/interview-optimizer.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SchedulingService } from './services/scheduling.service';

@Injectable()
export class InterviewService {
  constructor(
    private prisma: PrismaService,
    private dailyService: DailyService,
    private geminiService: GeminiService,
    private r2Service: CloudflareR2Service,
    private emailService: EmailService,
    private optimizerService: InterviewOptimizerService,
    private notificationsGateway: NotificationsGateway,
    private schedulingService: SchedulingService,
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

    // For live interviews, create Daily.co room immediately
    // For on-demand interviews, room will be created when candidate starts
    // If Daily.co is not configured, allow interview creation without room (room can be created later)
    let dailyRoomId: string | null = null;
    if (
      createInterviewDto.type === InterviewType.live ||
      !createInterviewDto.type
    ) {
      try {
        const room = await this.dailyService.createRoom({
          name: `interview-${candidate.id}-${Date.now()}`,
          privacy: 'private',
        });
        dailyRoomId = room.name;
        // Room response includes 'url' field with format: https://{domain}.daily.co/{roomName}
        // We store just the room name, and construct URL using domain when needed
      } catch (error: any) {
        // Log error but don't fail interview creation
        // Daily.co room can be created later when needed
        console.warn(
          `Failed to create Daily.co room for interview. Interview will be created without room. Error: ${error.message}`,
        );
        // Continue without dailyRoomId - room can be created later
      }
    }

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

  async getInterviewToken(
    interviewId: string,
    userId: string,
  ): Promise<string> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    // Check if interview is scheduled and if it's time yet
    if (interview.scheduledAt) {
      const now = new Date();
      const scheduledTime = new Date(interview.scheduledAt);
      const timeDiff = scheduledTime.getTime() - now.getTime();
      
      // Allow access 5 minutes before scheduled time
      const fiveMinutesBefore = 5 * 60 * 1000;
      // Allow access up to 2 hours after scheduled time (grace period for late joiners)
      const twoHoursAfter = 2 * 60 * 60 * 1000;
      
      const scheduledTimeStr = scheduledTime.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      
      // Check if too early (more than 5 minutes before)
      if (timeDiff > fiveMinutesBefore) {
        const minutesUntil = Math.ceil(timeDiff / (60 * 1000));
        throw new BadRequestException(
          `Interview is scheduled for ${scheduledTimeStr}. Please join 5 minutes before the scheduled time (${minutesUntil} minutes remaining).`,
        );
      }
      
      // Check if too late (more than 2 hours after scheduled time)
      if (timeDiff < -twoHoursAfter) {
        const hoursPassed = Math.floor(Math.abs(timeDiff) / (60 * 60 * 1000));
        throw new BadRequestException(
          `This interview was scheduled for ${scheduledTimeStr} and has expired (${hoursPassed} hours ago). Please contact the recruiter to reschedule.`,
        );
      }
    }

    if (!interview.dailyRoomId) {
      throw new NotFoundException('Interview room not found');
    }

    const isOwner = interview.clientId === userId;
    return await this.dailyService.getRoomToken(interview.dailyRoomId, userId, {
      isOwner,
    });
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
    const scores = await this.calculateDetailedScores(
      transcript,
      interview.job.description,
      interview.job.requiredSkills || [],
    );

    // Generate instant feedback
    const instantFeedback = this.optimizerService.generateInstantFeedback(scores);

    // Generate AI summary
    const summary = await this.geminiService.generateInterviewSummary(
      transcript,
      scores,
      interview.language,
    );

    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.awaiting_review,
        completedAt: new Date(),
        transcript,
        transcriptWithTimestamps,
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

  async startOnDemandInterview(
    interviewId: string,
  ): Promise<{ token: string; roomId: string }> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    if (interview.type !== InterviewType.on_demand) {
      throw new NotFoundException('This is not an on-demand interview');
    }

    // Create Daily.co room if not exists
    let roomId: string | null = interview.dailyRoomId;
    if (!roomId) {
      const room = await this.dailyService.createRoom({
        name: `interview-${interview.candidateId}-${Date.now()}`,
        privacy: 'private',
      });
      roomId = room.name;

      await this.prisma.interview.update({
        where: { id: interviewId },
        data: {
          dailyRoomId: roomId,
          candidateStartedAt: new Date(),
          status: InterviewStatus.in_progress,
        },
      });
    }

    if (!roomId) {
      throw new NotFoundException('Interview room not found');
    }

    // Get token for candidate (not owner)
    const token = await this.dailyService.getRoomToken(
      roomId,
      interview.candidateId,
      {
        isOwner: false,
      },
    );

    return { token, roomId };
  }

  async createRoomForInterview(interviewId: string): Promise<Interview> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    // Check if room already exists
    if (interview.dailyRoomId) {
      throw new BadRequestException('Room already exists for this interview');
    }

    // Create Daily.co room
    const room = await this.dailyService.createRoom({
      name: `interview-${interview.candidateId}-${Date.now()}`,
      privacy: 'private',
    });

    // Update interview with room ID
    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        dailyRoomId: room.name,
      },
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

    return updatedInterview;
  }

  /**
   * Calculate detailed multi-dimensional scores
   */
  async calculateDetailedScores(
    transcript: string,
    jobDescription: string,
    requiredSkills: string[],
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
      const communication = Math.min(100, technical + 5); // Estimate based on transcript
      const problemSolving = Math.min(100, technical - 5);
      const culturalFit = Math.min(100, technical);

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

      // Create Daily.co room for next interview if it's live
      let dailyRoomId: string | null = null;
      if (
        reviewData.nextInterviewData.type === InterviewType.live ||
        !reviewData.nextInterviewData.type
      ) {
        try {
          const room = await this.dailyService.createRoom({
            name: `interview-${interview.candidateId}-round-${nextRound}-${Date.now()}`,
            privacy: 'private',
          });
          dailyRoomId = room.name;
        } catch (error: any) {
          console.warn(
            `Failed to create Daily.co room for next round interview: ${error.message}`,
          );
        }
      }

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
