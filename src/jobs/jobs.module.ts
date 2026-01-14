import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { DataRetentionService } from './data-retention.service';
import { Job } from '../entities/job.entity';
import { Interview } from '../entities/interview.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Interview]),
    ScheduleModule.forRoot(),
    StorageModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, DataRetentionService],
  exports: [JobsService],
})
export class JobsModule {}
