import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InterviewController } from './interview.controller';
import { InterviewTemplateController } from './interview-template.controller';
import { InterviewService } from './interview.service';
import { InterviewTemplateService } from './interview-template.service';
import { DailyService } from './services/daily.service';
import { GeminiService } from './services/gemini.service';
import { GeminiRealtimeService } from './services/gemini-realtime.service';
import { WhisperService } from './services/whisper.service';
import { OpenaiInterviewService } from './services/openai-interview.service';
import { AiRouterService } from './services/ai-router.service';
import { InterviewOptimizerService } from './services/interview-optimizer.service';
import { SchedulingService } from './services/scheduling.service';
import { InterviewGateway } from './gateways/interview.gateway';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationModule } from '../automation/automation.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { EvaluationPoliciesModule } from '../evaluation-policies/evaluation-policies.module';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [
    StorageModule,
    EmailModule,
    NotificationsModule,
    AutomationModule,
    SourcingModule, // Import to access MatchingService for cultural fit scoring
    EvaluationPoliciesModule, // Import to access EvaluationPoliciesService
    EvidenceModule, // Import to access EvidenceService for automatic evidence attachment
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
    WhisperService,
    OpenaiInterviewService,
    AiRouterService,
    InterviewOptimizerService,
    SchedulingService,
    InterviewGateway,
  ],
  exports: [InterviewService, InterviewTemplateService, GeminiService, SchedulingService, InterviewOptimizerService],
})
export class InterviewModule {}
