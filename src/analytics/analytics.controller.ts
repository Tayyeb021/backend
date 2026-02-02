import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;

    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;

    return this.analyticsService.getDashboardAnalytics(userId, companyId, period);
  }

  @Get('time-to-hire')
  async getTimeToHire(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    return this.analyticsService.calculateTimeToHire(
      userId,
      companyId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('cost-per-hire')
  async getCostPerHire(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.calculateCostPerHire(userId, companyId, period);
  }

  @Get('quality-of-hire')
  async getQualityOfHire(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.calculateQualityOfHire(
      userId,
      companyId,
      period,
    );
  }

  @Get('interview-to-offer')
  async getInterviewToOfferRate(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.calculateInterviewToOfferRate(
      userId,
      companyId,
      period,
    );
  }

  @Get('source-effectiveness')
  async getSourceEffectiveness(@Request() req: any) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    return this.analyticsService.calculateSourceEffectiveness(userId, companyId);
  }

  @Get('scores/distribution')
  async getScoreDistribution(
    @Request() req: any,
    @Query('jobId') jobId?: string,
    @Query('scoreType') scoreType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.getScoreDistribution(
      userId,
      companyId,
      jobId,
      (scoreType as any) || 'overall',
      period,
    );
  }

  @Get('scores/trends')
  async getScoreTrends(
    @Request() req: any,
    @Query('jobId') jobId?: string,
    @Query('scoreType') scoreType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.getScoreTrends(
      userId,
      companyId,
      jobId,
      (scoreType as any) || 'overall',
      period,
      (groupBy as any) || 'week',
    );
  }

  @Get('scores/comparison')
  async getScoreComparison(
    @Request() req: any,
    @Query('jobId') jobId: string,
    @Query('scoreType') scoreType?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    return this.analyticsService.getScoreComparison(
      jobId,
      userId,
      companyId,
      (scoreType as any) || 'overall',
    );
  }

  @Get('evidence/quality')
  async getEvidenceQuality(
    @Request() req: any,
    @Query('jobId') jobId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const period = startDate && endDate
      ? {
          start: new Date(startDate),
          end: new Date(endDate),
        }
      : undefined;
    return this.analyticsService.getEvidenceQualityMetrics(userId, companyId, jobId, period);
  }
}
