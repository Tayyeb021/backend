import { Module } from '@nestjs/common';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';
import { ProxycurlService } from './services/proxycurl.service';
import { ScraperService } from './services/scraper.service';
import { MatchingService } from './services/matching.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [SourcingController],
  providers: [
    SourcingService,
    ProxycurlService,
    ScraperService,
    MatchingService,
  ],
  exports: [SourcingService, MatchingService],
})
export class SourcingModule {}
