import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import { SourceCandidateDto } from './dto/source-candidate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sourcing')
@UseGuards(JwtAuthGuard)
export class SourcingController {
  constructor(private sourcingService: SourcingService) {}

  @Post('source')
  async sourceCandidate(@Body() sourceCandidateDto: SourceCandidateDto) {
    switch (sourceCandidateDto.platform) {
      case 'linkedin':
        return this.sourcingService.sourceFromLinkedIn(
          sourceCandidateDto.profileUrl,
          sourceCandidateDto.jobId,
        );
      case 'bayt':
        return this.sourcingService.sourceFromBayt(
          sourceCandidateDto.profileUrl,
          sourceCandidateDto.jobId,
        );
      case 'naukri_gulf':
        return this.sourcingService.sourceFromNaukriGulf(
          sourceCandidateDto.profileUrl,
          sourceCandidateDto.jobId,
        );
      default:
        throw new Error('Unsupported platform');
    }
  }

  @Post('extract/:jobId')
  async extractCandidates(
    @Param('jobId') jobId: string,
    @Body() body: { numResults?: number },
  ) {
    return this.sourcingService.extractCandidatesFromJob(
      jobId,
      body.numResults || 10,
    );
  }
}
