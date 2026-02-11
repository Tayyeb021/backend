import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { InterviewModule } from '../interview/interview.module';
import { SourcingModule } from '../sourcing/sourcing.module';

@Module({
  imports: [InterviewModule, SourcingModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
