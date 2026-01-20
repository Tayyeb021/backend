import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  async createJob(@Body() createJobDto: CreateJobDto, @Request() req) {
    return this.jobsService.createJob(createJobDto, req.user.id);
  }

  @Get()
  async getJobs(@Request() req, @Query() query: JobQueryDto) {
    return this.jobsService.getJobsByClient(req.user.id, query);
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Put(':id')
  async updateJob(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @Request() req,
  ) {
    return this.jobsService.updateJob(id, updateJobDto, req.user.id);
  }

  @Delete(':id')
  async deleteJob(@Param('id') id: string, @Request() req) {
    await this.jobsService.deleteJob(id, req.user.id);
    return { message: 'Job deleted successfully' };
  }

  @Post(':id/auto-invite')
  async autoInviteCandidates(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { language?: string; type?: string; templateId?: string; daysAhead?: number[]; maxCandidates?: number },
  ) {
    return this.jobsService.autoInviteCandidates(id, req.user.id, body);
  }
}
