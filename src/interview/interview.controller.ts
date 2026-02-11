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
  Logger,
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
import { PrismaService } from '../prisma/prisma.service';
import { VideoProcessingStatus } from '@prisma/client';
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
    private prisma: PrismaService,
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
  @UseInterceptors(
    FileInterceptor('video', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per chunk (30s video at 2.5Mbps = ~9MB, so 50MB is safe)
      },
    }),
  )
  async uploadVideoChunk(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { chunkIndex: string },
    @Request() req,
  ) {
    const logger = new Logger(InterviewController.name);
    
    try {
      if (!file) {
        logger.error(`❌ Upload failed: No video file provided for chunk ${body.chunkIndex}`);
        throw new Error('No video file provided');
      }

      const chunkIndex = parseInt(body.chunkIndex, 10);
      
      // Validate chunk index
      if (isNaN(chunkIndex) || chunkIndex < 0) {
        logger.error(`❌ Upload failed: Invalid chunk index: ${body.chunkIndex}`);
        throw new Error(`Invalid chunk index: ${body.chunkIndex}`);
      }
      
      // Validate file size
      if (!file.buffer || file.buffer.length === 0) {
        logger.error(`❌ Upload failed: Chunk ${chunkIndex} is empty (0 bytes)`);
        throw new Error(`Chunk ${chunkIndex} is empty`);
      }
      
      const fileSizeMB = (file.buffer.length / 1024 / 1024).toFixed(2);
      const fileSizeBytes = file.buffer.length;
      logger.log(`📤 Receiving chunk ${chunkIndex}: ${fileSizeMB} MB (${fileSizeBytes} bytes)`);
      
      // Ensure temp directory exists
      const tempDir = await this.tempStorageService.ensureTempDirExists(id);
      
      const chunkPath = path.join(tempDir, `chunk-${chunkIndex}.webm`);
      
      // Retry logic for EBUSY errors (file might be locked during merge)
      let retries = 5; // Increased retries
      let lastError: any;
      
      while (retries > 0) {
        try {
          await fs.promises.writeFile(chunkPath, file.buffer);
          
          // Verify file was written correctly
          const stats = await fs.promises.stat(chunkPath);
          if (stats.size !== file.buffer.length) {
            throw new Error(`File size mismatch: expected ${file.buffer.length}, got ${stats.size}`);
          }
          
          // Get chunk duration using ffprobe (non-blocking, log if available)
          let chunkDuration: number | null = null;
          try {
            const { stdout } = await execAsync(
              `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${chunkPath}" 2>&1`
            );
            const duration = parseFloat(stdout.trim());
            if (!isNaN(duration) && duration > 0) {
              chunkDuration = duration;
            }
          } catch (probeError: any) {
            // ffprobe failed, but don't fail the upload - just log a warning
            logger.warn(`⚠️ Could not get duration for chunk ${chunkIndex}: ${probeError.message}`);
          }
          
          // Log successful save with duration if available
          if (chunkDuration !== null) {
            logger.log(`✅ Chunk ${chunkIndex} saved successfully: ${fileSizeMB} MB, duration: ${chunkDuration.toFixed(2)}s`);
          } else {
            logger.log(`✅ Chunk ${chunkIndex} saved successfully: ${fileSizeMB} MB (duration: unknown)`);
          }
          
          return {
            success: true,
            chunkIndex,
            message: `Chunk ${chunkIndex} stored in temp folder`,
            size: file.buffer.length,
            duration: chunkDuration,
          };
        } catch (error: any) {
          lastError = error;
          logger.warn(`⚠️ Failed to write chunk ${chunkIndex} (${retries} retries left): ${error.message}`);
          logger.warn(`   Chunk details: ${fileSizeMB} MB, error code: ${error.code || 'unknown'}`);
          
          if (error.code === 'EBUSY' && retries > 1) {
            // File is locked, wait a bit and retry (exponential backoff)
            const delay = Math.min(200 * (6 - retries), 1000); // 200ms, 400ms, 600ms, 800ms, 1000ms
            logger.warn(`   File locked (EBUSY), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
          } else if (error.code === 'ENOENT' && retries > 1) {
            // Directory doesn't exist, recreate it
            logger.warn(`   Directory missing (ENOENT), recreating...`);
            await this.tempStorageService.ensureTempDirExists(id);
            await new Promise(resolve => setTimeout(resolve, 100));
            retries--;
          } else {
            logger.error(`❌ Failed to write chunk ${chunkIndex}: ${error.message} (code: ${error.code || 'unknown'})`);
            logger.error(`   Chunk size: ${fileSizeMB} MB, path: ${chunkPath}`);
            throw error;
          }
        }
      }
      
      logger.error(`❌ Failed to write chunk ${chunkIndex} after all retries: ${lastError?.message}`);
      logger.error(`   Final chunk details: ${fileSizeMB} MB, path: ${chunkPath}`);
      throw new Error(`Failed to write chunk ${chunkIndex} after all retries: ${lastError?.message}`);
    } catch (error: any) {
      const logger = new Logger(InterviewController.name);
      logger.error(`❌ Upload chunk error for chunk ${body.chunkIndex}: ${error.message}`);
      logger.error(`   Error stack: ${error.stack}`);
      logger.error(`   Chunk size: ${file.buffer ? (file.buffer.length / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}`);
      
      // Re-throw with more context
      if (error.message.includes('File too large')) {
        throw new Error(`Chunk ${body.chunkIndex} is too large. Maximum size is 50MB.`);
      }
      throw error;
    }
  }

  @Post(':id/live/upload-complete')
  async uploadCompleteVideo(
    @Param('id') id: string,
    @Body() body: { actualDuration?: number },
    @Request() req,
  ) {
    const logger = new Logger(InterviewController.name);
    const actualDuration = body?.actualDuration;
    
    if (actualDuration && actualDuration > 0) {
      logger.log(`📊 Received actual interview duration: ${actualDuration.toFixed(2)}s`);
    } else {
      logger.warn(`⚠️ No actual interview duration received from frontend`);
    }

    // Update interview status to processing
    await this.prisma.interview.update({
      where: { id },
      data: {
        videoProcessingStatus: VideoProcessingStatus.processing,
        videoProcessingStartedAt: new Date(),
      } as any,
    });

    // Process video in background (fire-and-forget)
    this.videoProcessingService
      .processVideoChunksWithAudio(id, actualDuration)
      .then(async (result) => {
        // Update interview with completed status and video URL
        await this.prisma.interview.update({
          where: { id },
          data: {
            videoProcessingStatus: VideoProcessingStatus.completed,
            videoProcessingCompletedAt: new Date(),
            videoUrl: result.url,
          } as any,
        });
      })
      .catch(async (error) => {
        // Update interview with failed status and error message
        await this.prisma.interview.update({
          where: { id },
          data: {
            videoProcessingStatus: VideoProcessingStatus.failed,
            videoProcessingCompletedAt: new Date(),
            videoProcessingError: error.message || 'Video processing failed',
          } as any,
        });
      });

    // Return immediately
    return {
      success: true,
      message: 'Video processing started',
      status: 'processing',
    };
  }

  @Get(':id/video-status')
  async getVideoStatus(
    @Param('id') id: string,
    @Request() req,
  ) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    return {
      status: (interview as any).videoProcessingStatus || VideoProcessingStatus.pending,
      startedAt: (interview as any).videoProcessingStartedAt,
      completedAt: (interview as any).videoProcessingCompletedAt,
      error: (interview as any).videoProcessingError,
      videoUrl: interview.videoUrl,
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
