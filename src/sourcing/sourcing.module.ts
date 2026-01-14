import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';
import { ProxycurlService } from './services/proxycurl.service';
import { ScraperService } from './services/scraper.service';
import { MatchingService } from './services/matching.service';
import { Candidate } from '../entities/candidate.entity';
import { Job } from '../entities/job.entity';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [TypeOrmModule.forFeature([Candidate, Job]), EmailModule],
  controllers: [SourcingController],
  providers: [SourcingService, ProxycurlService, ScraperService, MatchingService],
  exports: [SourcingService],
})
export class SourcingModule {}
