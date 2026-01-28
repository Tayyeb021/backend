import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketIntelligenceService } from './market-intelligence.service';

@Controller('market-intelligence')
@UseGuards(JwtAuthGuard)
export class MarketIntelligenceController {
  constructor(
    private marketIntelligenceService: MarketIntelligenceService,
  ) {}

  @Get()
  async getMarketIntelligence(
    @Query('jobTitle') jobTitle: string,
    @Query('location') location: string,
    @Query('experienceLevel') experienceLevel?: string,
    @Query('industry') industry?: string,
  ) {
    return this.marketIntelligenceService.getMarketIntelligence(
      jobTitle,
      location,
      experienceLevel,
      industry,
    );
  }

  @Get('salary-benchmark')
  async getSalaryBenchmark(
    @Query('jobTitle') jobTitle: string,
    @Query('location') location: string,
    @Query('experienceLevel') experienceLevel?: string,
  ) {
    return this.marketIntelligenceService.getSalaryBenchmark(
      jobTitle,
      location,
      experienceLevel,
    );
  }

  @Get('skills-demand')
  async getSkillsDemand(
    @Query('jobTitle') jobTitle: string,
    @Query('location') location: string,
  ) {
    return this.marketIntelligenceService.getSkillsDemandTrend(
      jobTitle,
      location,
    );
  }

  @Get('trends')
  async getMarketTrends(
    @Query('jobTitle') jobTitle: string,
    @Query('location') location: string,
  ) {
    return this.marketIntelligenceService.getMarketTrends(jobTitle, location);
  }
}
