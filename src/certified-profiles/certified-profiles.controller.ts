import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CertifiedProfilesService } from './certified-profiles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('certified-profiles')
@UseGuards(JwtAuthGuard)
export class CertifiedProfilesController {
  constructor(private certifiedProfilesService: CertifiedProfilesService) {}

  @Post('certify/:candidateId/:jobId')
  async certifyProfile(
    @Param('candidateId') candidateId: string,
    @Param('jobId') jobId: string,
    @Request() req: any,
  ) {
    return this.certifiedProfilesService.certifyProfile(
      candidateId,
      jobId,
      req.user.id,
    );
  }

  @Get('candidate/:candidateId/job/:jobId')
  async getCertifiedProfile(
    @Param('candidateId') candidateId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.certifiedProfilesService.getCertifiedProfile(candidateId, jobId);
  }

  @Get('job/:jobId')
  async getCertifiedProfilesForJob(@Param('jobId') jobId: string) {
    return this.certifiedProfilesService.getCertifiedProfilesForJob(jobId);
  }
}
