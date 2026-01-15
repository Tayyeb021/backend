import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Interview, InterviewStatus, InterviewLanguage } from '@prisma/client';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { CreateInterviewDto } from './dto/create-interview.dto';

@Injectable()
export class InterviewService {
  constructor(
    private prisma: PrismaService,
    private dailyService: DailyService,
    private geminiService: GeminiService,
    private r2Service: CloudflareR2Service,
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

    // Create Daily.co room
    const room = await this.dailyService.createRoom({
      name: `interview-${candidate.id}-${Date.now()}`,
      privacy: 'private',
    });

    // Generate interview questions
    const questions = await this.geminiService.generateInterviewQuestions(
      job.description,
      createInterviewDto.language,
    );

    return await this.prisma.interview.create({
      data: {
        ...createInterviewDto,
        clientId,
        dailyRoomId: room.name,
        status: InterviewStatus.scheduled,
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
}
