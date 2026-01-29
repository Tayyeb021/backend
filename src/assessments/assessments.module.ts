import { Module } from '@nestjs/common';
import { AssessmentsController, PublicAssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { CodeExecutionService } from './services/code-execution.service';
import { GeminiCodeReviewService } from './services/gemini-code-review.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [AssessmentsController, PublicAssessmentsController],
  providers: [AssessmentsService, CodeExecutionService, GeminiCodeReviewService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
