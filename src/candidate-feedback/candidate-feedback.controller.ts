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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CandidateFeedbackService } from './candidate-feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { SendFeedbackDto } from './dto/send-feedback.dto';
import { RequestFeedbackDto } from './dto/request-feedback.dto';

@Controller('candidate-feedback')
@UseGuards(JwtAuthGuard)
export class CandidateFeedbackController {
  constructor(private candidateFeedbackService: CandidateFeedbackService) {}

  @Post()
  async createFeedback(@Request() req: any, @Body() dto: CreateFeedbackDto) {
    return this.candidateFeedbackService.createFeedback(dto, req.user.id);
  }

  @Get('candidate/:candidateId')
  async getFeedbackForCandidate(@Param('candidateId') candidateId: string) {
    return this.candidateFeedbackService.getFeedbackForCandidate(candidateId);
  }

  @Get('job/:jobId')
  async getFeedbackForJob(@Param('jobId') jobId: string) {
    return this.candidateFeedbackService.getFeedbackForJob(jobId);
  }

  @Get('interview/:interviewId')
  async getFeedbackForInterview(@Param('interviewId') interviewId: string) {
    return this.candidateFeedbackService.getFeedbackForInterview(interviewId);
  }

  @Get('hiring-decision/:decisionId')
  async getFeedbackForHiringDecision(@Param('decisionId') decisionId: string) {
    return this.candidateFeedbackService.getFeedbackForHiringDecision(decisionId);
  }

  @Get(':id')
  async getFeedbackById(@Param('id') id: string) {
    return this.candidateFeedbackService.getFeedbackById(id);
  }

  @Post(':id/send')
  async sendFeedback(
    @Request() req: any,
    @Param('id') id: string,
    @Body() sendDto: SendFeedbackDto,
  ) {
    return this.candidateFeedbackService.sendFeedback(id, sendDto, req.user.id);
  }

  @Put(':id/approve')
  async approveFeedback(@Request() req: any, @Param('id') id: string) {
    return this.candidateFeedbackService.approveFeedback(id, req.user.id);
  }

  @Put(':id/reject')
  async rejectFeedback(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.candidateFeedbackService.rejectFeedback(id, req.user.id, body?.reason);
  }

  @Post('request')
  async requestFeedback(@Request() req: any, @Body() dto: RequestFeedbackDto) {
    return this.candidateFeedbackService.requestFeedback(dto, req.user.id);
  }

  @Get('requests/all')
  async getFeedbackRequests(@Request() req: any) {
    return this.candidateFeedbackService.getFeedbackRequests(
      req.user.id,
      req.user.companyId,
    );
  }
}
