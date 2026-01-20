import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InterviewController } from './interview.controller';
import { InterviewTemplateController } from './interview-template.controller';
import { InterviewService } from './interview.service';
import { InterviewTemplateService } from './interview-template.service';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { GeminiRealtimeService } from './services/gemini-realtime.service';
import { InterviewGateway } from './gateways/interview.gateway';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    StorageModule,
    EmailModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [InterviewController, InterviewTemplateController],
  providers: [
    InterviewService,
    InterviewTemplateService,
    DailyService,
    GeminiService,
    GeminiRealtimeService,
    InterviewGateway,
  ],
  exports: [InterviewService, InterviewTemplateService],
})
export class InterviewModule {}
