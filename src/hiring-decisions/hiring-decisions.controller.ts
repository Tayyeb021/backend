import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { HiringDecisionsService } from './hiring-decisions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('hiring-decisions')
@UseGuards(JwtAuthGuard)
export class HiringDecisionsController {
  constructor(private hiringDecisionsService: HiringDecisionsService) {}

  @Post()
  async createDecision(@Request() req: any, @Body() body: {
    candidateId: string;
    jobId: string;
    decisionType: 'hire' | 'reject' | 'hold' | 'offer_pending';
    rationale: string;
    overridesAI?: boolean;
  }) {
    return this.hiringDecisionsService.createDecision({
      ...body,
      madeBy: req.user.id,
    });
  }

  @Get('candidate/:candidateId/job/:jobId')
  async getDecision(
    @Param('candidateId') candidateId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.hiringDecisionsService.getDecision(candidateId, jobId);
  }

  @Get('job/:jobId')
  async getDecisionsForJob(@Param('jobId') jobId: string) {
    return this.hiringDecisionsService.getDecisionsForJob(jobId);
  }

  @Put(':id')
  async updateDecision(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updates: {
      decisionType?: 'hire' | 'reject' | 'hold' | 'offer_pending';
      rationale?: string;
      status?: 'pending' | 'approved' | 'rejected' | 'on_hold';
    },
  ) {
    return this.hiringDecisionsService.updateDecision(id, updates, req.user.id);
  }
}
