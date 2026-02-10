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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { InterviewService } from './interview.service';
import { InterviewVideoRecordingService } from './services/interview-video-recording.service';
import { VideoProcessingService } from './services/video-processing.service';
import { TTSService } from './services/tts.service';
import { InterviewTempStorageService } from './services/interview-temp-storage.service';
import { CreateInterviewDto } from './dto/update-create-interview.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(
    private interviewService: InterviewService,
    private videoRecordingService: InterviewVideoRecordingService,
    private videoProcessingService: VideoProcessingService,
    private ttsService: TTSService,
    private tempStorageService: InterviewTempStorageService,
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
      conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date | string;
      }>;
    },
  ) {
    return this.interviewService.completeInterview(id, {
      transcript: body.transcript,
      transcriptWithTimestamps: body.transcriptWithTimestamps,
      videoUrl: body.videoUrl,
      conversationHistory: body.conversationHistory,
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
    
    // Ensure temp directory exists
    const tempDir = await this.tempStorageService.ensureTempDirExists(id);
    
    const chunkPath = path.join(tempDir, `chunk-${chunkIndex}.webm`);
    
    // Retry logic for EBUSY errors (file might be locked during merge)
    let retries = 3;
    let lastError: any;
    
    while (retries > 0) {
      try {
        await fs.promises.writeFile(chunkPath, file.buffer);
        return {
          success: true,
          chunkIndex,
          message: `Chunk ${chunkIndex} stored in temp folder`,
        };
      } catch (error: any) {
        lastError = error;
        if (error.code === 'EBUSY' && retries > 1) {
          // File is locked, wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 100));
          retries--;
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Failed to write chunk after retries: ${lastError?.message}`);
  }

  @Post(':id/live/upload-complete')
  async uploadCompleteVideo(
    @Param('id') id: string,
    @Request() req,
  ) {
    // Concatenate video chunks and mix AI audio, then upload final video
    const result = await this.videoProcessingService.processVideoChunksWithAudio(id);

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

  @Post(':id/live/merge-chunks')
  async mergeVideoChunks(
    @Param('id') id: string,
    @Request() req,
  ) {
    const result = await this.videoProcessingService.mergeVideoChunks(id);
    return {
      success: true,
      key: result.key,
      url: result.url,
    };
  }

  @Post(':id/live/tts-audio')
  async generateTTSAudio(
    @Param('id') id: string,
    @Body() body: { text: string; language: string; timestamp?: number },
    @Request() req,
    @Res() res: Response,
  ) {
    try {
      if (!body.text || body.text.trim().length === 0) {
        return res.status(400).json({
          error: 'Text is required for TTS generation',
          message: 'Falling back to browser speech synthesis',
        });
      }

      // Generate audio using TTS service
      const audioBuffer = await this.ttsService.generateSpeech(
        body.text,
        body.language || 'en',
      );

      // Store audio in temp folder with timestamp if provided
      if (body.timestamp !== undefined) {
        const tempDir = await this.tempStorageService.ensureTempDirExists(id);
        const audioPath = path.join(tempDir, `tts-${body.timestamp}.mp3`);
        
        // Retry logic for EBUSY errors
        let retries = 3;
        while (retries > 0) {
          try {
            await fs.promises.writeFile(audioPath, audioBuffer);
            break;
          } catch (error: any) {
            if (error.code === 'EBUSY' && retries > 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retries--;
            } else {
              throw error;
            }
          }
        }
      }

      // Return audio directly as MP3 for immediate playback
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (error: any) {
      // Return error but don't throw - frontend will fall back to speech synthesis
      res.status(500).json({
        error: error.message || 'TTS generation failed',
        message: 'Falling back to browser speech synthesis',
      });
    }
  }
}
