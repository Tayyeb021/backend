import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { GeminiRealtimeService } from './services/gemini-realtime.service';
import { InterviewGateway } from './gateways/interview.gateway';
import { Interview } from '../entities/interview.entity';
import { Candidate } from '../entities/candidate.entity';
import { Job } from '../entities/job.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Interview, Candidate, Job]),
    StorageModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [InterviewController],
  providers: [
    InterviewService,
    DailyService,
    GeminiService,
    GeminiRealtimeService,
    InterviewGateway,
  ],
  exports: [InterviewService],
})
export class InterviewModule {}
