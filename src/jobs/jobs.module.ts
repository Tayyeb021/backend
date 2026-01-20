import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsAutoInviteService } from './jobs-auto-invite.service';
import { DataRetentionService } from './data-retention.service';
import { StorageModule } from '../storage/storage.module';
import { InterviewModule } from '../interview/interview.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    StorageModule,
    forwardRef(() => InterviewModule),
    SourcingModule,
    EmailModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsAutoInviteService, DataRetentionService],
  exports: [JobsService],
})
export class JobsModule {}
