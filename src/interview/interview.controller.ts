import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { InterviewService } from './interview.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(private interviewService: InterviewService) {}

  @Post()
  async createInterview(
    @Body() createInterviewDto: CreateInterviewDto,
    @Request() req,
  ) {
    return this.interviewService.createInterview(
      createInterviewDto,
      req.user.id,
    );
  }

  @Get(':id/token')
  async getInterviewToken(@Param('id') id: string, @Request() req) {
    return {
      token: await this.interviewService.getInterviewToken(id, req.user.id),
    };
  }

  @Get(':id')
  async getInterview(@Param('id') id: string) {
    return this.interviewService.getInterview(id);
  }

  @Get()
  async getInterviews(@Request() req) {
    return this.interviewService.getInterviewsByClient(req.user.id);
  }

  @Patch(':id/start')
  async startInterview(@Param('id') id: string) {
    return this.interviewService.startInterview(id);
  }

  @Post(':id/upload-video')
  async uploadVideo(
    @Param('id') id: string,
    @Body() body: { videoData: string }, // Base64 encoded video
  ) {
    const videoBuffer = Buffer.from(body.videoData, 'base64');
    return {
      videoUrl: await this.interviewService.uploadVideoRecording(
        id,
        videoBuffer,
      ),
    };
  }

  @Patch(':id/complete')
  async completeInterview(
    @Param('id') id: string,
    @Body()
    body: {
      transcript: string;
      transcriptWithTimestamps: any[];
      videoUrl?: string;
    },
  ) {
    return this.interviewService.completeInterview(id, {
      transcript: body.transcript,
      transcriptWithTimestamps: body.transcriptWithTimestamps,
      videoUrl: body.videoUrl,
    });
  }

  @Patch(':id/schedule')
  async scheduleInterview(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string; selectedDateIndex?: number },
  ) {
    return this.interviewService.scheduleInterview(
      id,
      new Date(body.scheduledAt),
      body.selectedDateIndex,
    );
  }

  @Post(':id/start-on-demand')
  async startOnDemandInterview(@Param('id') id: string) {
    return this.interviewService.startOnDemandInterview(id);
  }
}
