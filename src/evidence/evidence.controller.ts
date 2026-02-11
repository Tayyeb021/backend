import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachEvidenceDto } from './dto/evidence.dto';

@Controller('evidence')
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(private evidenceService: EvidenceService) {}

  @Post()
  async attachEvidence(@Body() dto: AttachEvidenceDto) {
    return this.evidenceService.attachEvidence(dto);
  }

  @Get('score/:scoreId')
  async getEvidenceForScore(@Param('scoreId') scoreId: string) {
    return this.evidenceService.getEvidenceForScore(scoreId);
  }

  @Get('interview/:interviewId')
  async getEvidenceForInterview(@Param('interviewId') interviewId: string) {
    return this.evidenceService.getEvidenceForInterview(interviewId);
  }

  @Get('assessment/:assessmentId')
  async getEvidenceForAssessment(@Param('assessmentId') assessmentId: string) {
    return this.evidenceService.getEvidenceForAssessment(assessmentId);
  }

  @Get('validate/:scoreId')
  async validateScoreHasEvidence(@Param('scoreId') scoreId: string) {
    const hasEvidence = await this.evidenceService.validateScoreHasEvidence(scoreId);
    return { hasEvidence };
  }
}
