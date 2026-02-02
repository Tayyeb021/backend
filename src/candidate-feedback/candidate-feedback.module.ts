import { Module } from '@nestjs/common';
import { CandidateFeedbackController } from './candidate-feedback.controller';
import { CandidateFeedbackService } from './candidate-feedback.service';
import { FeedbackGeneratorService } from './services/feedback-generator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackTemplatesModule } from '../feedback-templates/feedback-templates.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    FeedbackTemplatesModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [CandidateFeedbackController],
  providers: [
    CandidateFeedbackService,
    FeedbackGeneratorService,
  ],
  exports: [CandidateFeedbackService, FeedbackGeneratorService],
})
export class CandidateFeedbackModule {}
