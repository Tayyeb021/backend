import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InterviewController } from './interview.controller';
import { InterviewTemplateController } from './interview-template.controller';
import { InterviewService } from './interview.service';
import { InterviewTemplateService } from './interview-template.service';
import { GeminiService } from './services/gemini.service';
import { GeminiRealtimeService } from './services/gemini-realtime.service';
import { VideoProcessingService } from './services/video-processing.service';
import { InterviewOptimizerService } from './services/interview-optimizer.service';
import { SchedulingService } from './services/scheduling.service';
import { InterviewVideoRecordingService } from './services/interview-video-recording.service';
import { InterviewTempStorageService } from './services/interview-temp-storage.service';
import { LiveInterviewDeepgramService } from './services/live-interview-deepgram.service';
import { LiveInterviewGeminiService } from './services/live-interview-gemini.service';
import { NewInterviewDeepgramService } from './services/new-interview-deepgram.service';
import { TTSService } from './services/tts.service';
import { InterviewGateway } from './gateways/interview.gateway';
import { LiveInterviewGateway } from './gateways/live-interview.gateway';
import { NewInterviewGateway } from './gateways/new-interview.gateway';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationModule } from '../automation/automation.module';
import { SourcingModule } from '../sourcing/sourcing.module';

@Module({
  imports: [
    StorageModule,
    EmailModule,
    NotificationsModule,
    AutomationModule,
    SourcingModule, // Import to access MatchingService for cultural fit scoring
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [InterviewController, InterviewTemplateController],
  providers: [
    InterviewService,
    InterviewTemplateService,
    GeminiService,
    GeminiRealtimeService,
    VideoProcessingService,
    InterviewOptimizerService,
    SchedulingService,
    InterviewVideoRecordingService,
    InterviewTempStorageService,
    LiveInterviewDeepgramService,
    LiveInterviewGeminiService,
    NewInterviewDeepgramService,
    TTSService,
    InterviewGateway,
    LiveInterviewGateway,
    NewInterviewGateway,
  ],
  exports: [
    InterviewService, 
    InterviewTemplateService, 
    GeminiService, 
    SchedulingService, 
    InterviewOptimizerService,
    LiveInterviewDeepgramService, // Export for use in TranscriptionModule
  ],
})
export class InterviewModule {}
