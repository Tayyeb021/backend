import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Interview, InterviewStatus, InterviewLanguage, InterviewType } from '@prisma/client';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { EmailService } from '../email/email.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';

@Injectable()
export class InterviewService {
  constructor(
    private prisma: PrismaService,
    private dailyService: DailyService,
    private geminiService: GeminiService,
    private r2Service: CloudflareR2Service,
    private emailService: EmailService,
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
    let dailyRoomId: string | null = null;
    if (createInterviewDto.type === InterviewType.live || !createInterviewDto.type) {
      const room = await this.dailyService.createRoom({
        name: `interview-${candidate.id}-${Date.now()}`,
        privacy: 'private',
      });
      dailyRoomId = room.name;
    }

    // Determine initial status
    let status = InterviewStatus.scheduled;
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
    transcript: string,
    transcriptWithTimestamps: any[],
    videoUrl?: string,
  ): Promise<Interview> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { job: true, candidate: true },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    // Calculate scores (simplified - would use Gemini to evaluate)
    const scores = {
      technical: 75,
      communication: 80,
      culturalFit: 70,
      overall: 75,
    };

    // Generate AI summary
    const summary = await this.geminiService.generateInterviewSummary(
      transcript,
      scores,
      interview.language,
    );

    return await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.completed,
        completedAt: new Date(),
        transcript,
        transcriptWithTimestamps,
        videoUrl: videoUrl || interview.videoUrl,
        scores,
        aiSummary: summary,
      },
    });
  }

  async getInterview(interviewId: string): Promise<Interview> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: { candidate: true, job: true, client: true },
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
      throw new NotFoundException('Self-scheduling not allowed for this interview');
    }

    // Update dateOptions if provided
    let dateOptions = interview.dateOptions as any;
    if (selectedDateIndex !== undefined && dateOptions && Array.isArray(dateOptions)) {
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
        dateOptions: dateOptions as any,
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

      await this.emailService.sendInterviewConfirmationWithCalendar(
        interview.candidate.email,
        interview.candidate.name || 'Candidate',
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

  async startOnDemandInterview(interviewId: string): Promise<{ token: string; roomId: string }> {
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
    let dailyRoomId = interview.dailyRoomId;
    if (!dailyRoomId) {
      const room = await this.dailyService.createRoom({
        name: `interview-${interview.candidateId}-${Date.now()}`,
        privacy: 'private',
      });
      dailyRoomId = room.name;

      await this.prisma.interview.update({
        where: { id: interviewId },
        data: {
          dailyRoomId,
          candidateStartedAt: new Date(),
          status: InterviewStatus.in_progress,
        },
      });
    }

    // Get token for candidate (not owner)
    const token = await this.dailyService.getRoomToken(dailyRoomId, interview.candidateId, {
      isOwner: false,
    });

    return { token, roomId: dailyRoomId };
  }
}
