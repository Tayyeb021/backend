import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveInterviewDeepgramService } from '../interview/services/live-interview-deepgram.service';
import { Logger } from '@nestjs/common';

@Controller('transcription')
@UseGuards(JwtAuthGuard)
export class TranscriptionController {
  private readonly logger = new Logger(TranscriptionController.name);

  constructor(
    private deepgramService: LiveInterviewDeepgramService,
  ) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language?: string,
  ) {
    try {
      if (!file) {
        throw new Error('No audio file provided');
      }

      this.logger.log(`Transcribing audio file: ${file.size} bytes, type: ${file.mimetype}`);

      // Use the Deepgram service's transcribeAudioFile method
      // First, we need to upload the file temporarily or use a different approach
      // Since transcribeAudioFile expects an R2 key, we'll use Deepgram's buffer transcription directly
      const deepgram = (this.deepgramService as any).deepgram;
      if (!deepgram) {
        throw new Error('Deepgram client not initialized');
      }

      // Use Deepgram's prerecorded transcription with buffer
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
        file.buffer,
        {
          model: 'nova-2',
          language: this.mapLanguageCode(language || 'en-US'),
          smart_format: true,
          punctuate: true,
          mimetype: file.mimetype || 'audio/webm',
        },
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      
      this.logger.log(`Transcription complete: ${transcript.length} characters`);
      
      return {
        transcript,
        duration: result?.metadata?.duration || 0,
      };
    } catch (error: any) {
      this.logger.error('Error transcribing audio:', error);
      throw error;
    }
  }

  private mapLanguageCode(language: string): string {
    const languageMap: Record<string, string> = {
      en: 'en-US',
      ar: 'ar',
      hi: 'hi',
      ur: 'ur',
      bn: 'bn',
    };
    return languageMap[language] || 'en-US';
  }
}
