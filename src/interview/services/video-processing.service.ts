import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CloudflareR2Service } from '../../storage/cloudflare-r2.service';

const execAsync = promisify(exec);

@Injectable()
export class VideoProcessingService {
  constructor(private r2Service: CloudflareR2Service) {}

  /**
   * Extract audio from video file using FFmpeg
   * Downloads video from R2, extracts audio, uploads audio back to R2
   * @param videoKey R2 key of the video file
   * @param interviewId Interview ID for organizing files
   * @returns R2 key of the extracted audio file
   */
  async extractAudioFromVideo(
    videoKey: string,
    interviewId: string,
  ): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `video-processing-${Date.now()}`);
    const videoPath = path.join(tempDir, 'input.webm');
    const audioPath = path.join(tempDir, 'output.wav');

    try {
      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Download video from R2 (using presigned URL)
      const downloadUrl = await this.r2Service.generatePresignedDownloadUrl(videoKey);
      const videoResponse = await fetch(downloadUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await fs.promises.writeFile(videoPath, videoBuffer);

      // Extract audio using FFmpeg
      // Convert to WAV format (16kHz, mono) for better Deepgram compatibility
      const ffmpegCommand = `ffmpeg -i "${videoPath}" -ar 16000 -ac 1 -f wav "${audioPath}" -y`;
      await execAsync(ffmpegCommand);

      // Read extracted audio
      const audioBuffer = await fs.promises.readFile(audioPath);

      // Upload audio to R2
      const { url: uploadUrl, key: audioKey } = await this.r2Service.generatePresignedUploadUrl(
        interviewId,
        undefined,
        'audio/wav',
      );

      // Upload using presigned URL
      await fetch(uploadUrl, {
        method: 'PUT',
        body: audioBuffer,
        headers: {
          'Content-Type': 'audio/wav',
        },
      });

      return audioKey;
    } catch (error: any) {
      throw new Error(`Failed to extract audio: ${error.message}`);
    } finally {
      // Cleanup temp files
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }

  /**
   * Get video duration using FFmpeg
   */
  async getVideoDuration(videoKey: string): Promise<number> {
    const tempDir = path.join(os.tmpdir(), `video-duration-${Date.now()}`);
    const videoPath = path.join(tempDir, 'input.webm');

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Download video
      const downloadUrl = await this.r2Service.generatePresignedDownloadUrl(videoKey);
      const videoResponse = await fetch(downloadUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await fs.promises.writeFile(videoPath, videoBuffer);

      // Get duration using FFprobe
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );

      const duration = parseFloat(stdout.trim());
      return Math.round(duration); // Return duration in seconds (rounded)
    } catch (error: any) {
      console.error('Failed to get video duration:', error);
      return 0; // Return 0 if duration cannot be determined
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }
}
