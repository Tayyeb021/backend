import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RankingService } from './ranking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ranking')
@UseGuards(JwtAuthGuard)
export class RankingController {
  constructor(private rankingService: RankingService) {}

  @Post('job/:jobId/generate')
  async generateRanking(
    @Param('jobId') jobId: string,
    @Request() req: any,
  ) {
    return this.rankingService.generateRankingSnapshot(jobId, req.user.id);
  }

  @Get('job/:jobId')
  async getActiveRanking(@Param('jobId') jobId: string) {
    return this.rankingService.getActiveRanking(jobId);
  }

  @Get('job/:jobId/history')
  async getRankingHistory(@Param('jobId') jobId: string) {
    return this.rankingService.getRankingHistory(jobId);
  }
}
