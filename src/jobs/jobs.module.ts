import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { DataRetentionService } from './data-retention.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule],
  controllers: [JobsController],
  providers: [JobsService, DataRetentionService],
  exports: [JobsService],
})
export class JobsModule {}
