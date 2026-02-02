import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InterviewService } from './interview.service';
import { InterviewVideoRecordingService } from './services/interview-video-recording.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(
    private interviewService: InterviewService,
    private videoRecordingService: InterviewVideoRecordingService,
  ) {}

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

  @Post(':id/create-room')
  async createRoom(@Param('id') id: string) {
    return this.interviewService.createRoomForInterview(id);
  }

  // New async interview endpoints
  @Post(':id/session')
  async createInterviewSession(@Param('id') id: string, @Request() req) {
    return this.interviewService.createInterviewSession(id, req.user.id);
  }

  @Get(':id/session/:sessionId/upload-url')
  async getUploadUrl(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Request() req,
  ) {
    return this.interviewService.generateUploadUrl(id, sessionId, req.user.id);
  }

  @Post(':id/session/:sessionId/answer/:questionId/complete')
  async completeAnswer(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Param('questionId') questionId: string,
    @Body() body: { videoKey: string },
    @Request() req,
  ) {
    return this.interviewService.completeAnswer(
      id,
      sessionId,
      questionId,
      body.videoKey,
      req.user.id,
    );
  }

  @Get(':id/session/:sessionId/next-question')
  async getNextQuestion(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Query('skipGreeting') skipGreeting: string,
    @Request() req,
  ) {
    return this.interviewService.getNextQuestion(
      id,
      sessionId,
      req.user.id,
      skipGreeting === 'true',
    );
  }

  // Live interview video recording endpoints
  @Post(':id/live/upload-chunk')
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideoChunk(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { chunkIndex: string },
    @Request() req,
  ) {
    if (!file) {
      throw new Error('No video file provided');
    }

    const chunkIndex = parseInt(body.chunkIndex, 10);
    const result = await this.videoRecordingService.uploadVideoChunk(
      id,
      chunkIndex,
      file.buffer,
      file.mimetype || 'video/webm',
    );

    return {
      success: true,
      key: result.key,
      url: result.url,
      chunkIndex,
    };
  }

  @Post(':id/live/upload-complete')
  @UseInterceptors(FileInterceptor('video'))
  async uploadCompleteVideo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new Error('No video file provided');
    }

    const result = await this.videoRecordingService.uploadCompleteVideo(
      id,
      file.buffer,
      file.mimetype || 'video/webm',
    );

    // Just save the video URL, don't evaluate the interview yet
    // TODO: Add interview evaluation later

    return {
      success: true,
      key: result.key,
      url: result.url,
    };
  }

  @Get(':id/live/presigned-url')
  async getPresignedUploadUrl(
    @Param('id') id: string,
    @Request() req,
    @Query('chunkIndex') chunkIndex?: string,
  ) {
    const chunkIndexNum = chunkIndex ? parseInt(chunkIndex, 10) : undefined;
    const result = await this.videoRecordingService.getPresignedUploadUrl(
      id,
      chunkIndexNum,
    );

    return {
      url: result.url,
      key: result.key,
    };
  }

  @Get(':id/live/playback-url')
  async getPlaybackUrl(
    @Param('id') id: string,
    @Query('key') key: string,
    @Request() req,
  ) {
    const url = await this.videoRecordingService.getPresignedPlaybackUrl(key);
    return { url };
  }
}
