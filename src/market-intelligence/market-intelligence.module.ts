import { Module } from '@nestjs/common';
import { MarketIntelligenceController } from './market-intelligence.controller';
import { MarketIntelligenceService } from './market-intelligence.service';

@Module({
  controllers: [MarketIntelligenceController],
  providers: [MarketIntelligenceService],
  exports: [MarketIntelligenceService],
})
export class MarketIntelligenceModule {}
