import { Module } from '@nestjs/common';
import { FeedbackTemplatesController } from './feedback-templates.controller';
import { FeedbackTemplatesService } from './feedback-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackTemplatesController],
  providers: [FeedbackTemplatesService],
  exports: [FeedbackTemplatesService],
})
export class FeedbackTemplatesModule {}
