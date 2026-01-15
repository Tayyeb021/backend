import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('candidates')
@UseGuards(JwtAuthGuard)
export class CandidatesController {
  constructor(private candidatesService: CandidatesService) {}

  @Post()
  async createCandidate(@Body() createCandidateDto: CreateCandidateDto) {
    return this.candidatesService.createCandidate(createCandidateDto);
  }

  @Get()
  async getCandidates(@Query('jobId') jobId?: string) {
    if (jobId) {
      return this.candidatesService.getCandidatesByJob(jobId);
    }
    return [];
  }

  @Get(':id')
  async getCandidate(@Param('id') id: string) {
    return this.candidatesService.getCandidate(id);
  }

  @Put(':id')
  async updateCandidate(
    @Param('id') id: string,
    @Body() updateCandidateDto: UpdateCandidateDto,
  ) {
    return this.candidatesService.updateCandidate(id, updateCandidateDto);
  }

  @Patch(':id/status')
  async updateCandidateStatus(
    @Param('id') id: string,
    @Body() body: { status: CandidateStatus },
  ) {
    return this.candidatesService.updateCandidateStatus(id, body.status);
  }
}
