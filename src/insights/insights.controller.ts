import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get('candidate/:candidateId')
  async getCandidateInsights(
    @Param('candidateId') candidateId: string,
    @Query('jobId') jobId?: string,
  ) {
    return this.insightsService.getCandidateInsights(candidateId, jobId);
  }

  @Get('candidate/:candidateId/calculate')
  async calculateCandidateInsights(
    @Param('candidateId') candidateId: string,
    @Query('jobId') jobId?: string,
  ) {
    return this.insightsService.calculateCandidateInsights(
      candidateId,
      jobId,
    );
  }
}
