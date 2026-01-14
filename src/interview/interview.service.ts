import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interview, InterviewStatus, InterviewLanguage } from '../entities/interview.entity';
import { Candidate } from '../entities/candidate.entity';
import { Job } from '../entities/job.entity';
import { User } from '../entities/user.entity';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { CreateInterviewDto } from './dto/create-interview.dto';

@Injectable()
export class InterviewService {
  constructor(
    @InjectRepository(Interview)
    private interviewRepository: Repository<Interview>,
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    private dailyService: DailyService,
    private geminiService: GeminiService,
    private r2Service: CloudflareR2Service,
  ) {}

  async createInterview(
    createInterviewDto: CreateInterviewDto,
    recruiterId: string,
  ): Promise<Interview> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: createInterviewDto.candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    const job = await this.jobRepository.findOne({
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

    const interview = this.interviewRepository.create({
      ...createInterviewDto,
      recruiterId,
      dailyRoomId: room.name,
      status: InterviewStatus.SCHEDULED,
    });

    return await this.interviewRepository.save(interview);
  }

  async getInterviewToken(interviewId: string, userId: string): Promise<string> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const isOwner = interview.recruiterId === userId;
    return await this.dailyService.getRoomToken(interview.dailyRoomId, userId, {
      isOwner,
    });
  }

  async startInterview(interviewId: string): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    interview.status = InterviewStatus.IN_PROGRESS;
    interview.startedAt = new Date();

    return await this.interviewRepository.save(interview);
  }

  async uploadVideoRecording(
    interviewId: string,
    videoBuffer: Buffer,
  ): Promise<string> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const videoUrl = await this.r2Service.uploadVideo(interviewId, videoBuffer);
    interview.videoUrl = videoUrl;
    await this.interviewRepository.save(interview);

    return videoUrl;
  }

  async completeInterview(
    interviewId: string,
    transcript: string,
    transcriptWithTimestamps: any[],
    videoUrl?: string,
  ): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
      relations: ['job', 'candidate'],
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    interview.status = InterviewStatus.COMPLETED;
    interview.completedAt = new Date();
    interview.transcript = transcript;
    interview.transcriptWithTimestamps = transcriptWithTimestamps;
    interview.videoUrl = videoUrl;

    // Calculate scores (simplified - would use Gemini to evaluate)
    const scores = {
      technical: 75,
      communication: 80,
      culturalFit: 70,
      overall: 75,
    };

    interview.scores = scores;

    // Generate AI summary
    const summary = await this.geminiService.generateInterviewSummary(
      transcript,
      scores,
      interview.language,
    );

    interview.aiSummary = summary;

    return await this.interviewRepository.save(interview);
  }

  async getInterview(interviewId: string): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
      relations: ['candidate', 'job', 'recruiter'],
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    return interview;
  }

  async getInterviewsByRecruiter(recruiterId: string): Promise<Interview[]> {
    return await this.interviewRepository.find({
      where: { recruiterId },
      relations: ['candidate', 'job'],
      order: { createdAt: 'DESC' },
    });
  }
}
