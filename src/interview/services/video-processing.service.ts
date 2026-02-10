import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CloudflareR2Service } from '../../storage/cloudflare-r2.service';
import { InterviewVideoRecordingService } from './interview-video-recording.service';
import { InterviewTempStorageService } from './interview-temp-storage.service';

const execAsync = promisify(exec);

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    private r2Service: CloudflareR2Service,
    private videoRecordingService: InterviewVideoRecordingService,
    private tempStorageService: InterviewTempStorageService,
  ) {}

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

  /**
   * Merge multiple WebM video chunks into a single valid WebM file using FFmpeg
   * Downloads chunks from R2, merges them, and uploads the result back to R2
   * @param interviewId Interview ID
   * @returns R2 key and URL of the merged video
   */
  async mergeVideoChunks(interviewId: string): Promise<{ key: string; url: string }> {
    const tempDir = path.join(os.tmpdir(), `video-merge-${interviewId}-${Date.now()}`);
    const outputPath = path.join(tempDir, 'merged.webm');
    const concatListPath = path.join(tempDir, 'concat-list.txt');

    try {
      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true });

      this.logger.log(`Starting video merge for interview ${interviewId}`);

      // List all chunks for this interview
      const chunks = await this.videoRecordingService.listVideoChunks(interviewId);

      if (chunks.length === 0) {
        throw new Error('No video chunks found to merge');
      }

      this.logger.log(`Found ${chunks.length} chunks to merge`);

      // Download all chunks and validate them
      const chunkPaths: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPath = path.join(tempDir, `chunk-${i}.webm`);
        
        this.logger.log(`Downloading chunk ${i + 1}/${chunks.length}: ${chunk.key}`);
        
        const downloadUrl = await this.videoRecordingService.getChunkDownloadUrl(chunk.key);
        const chunkResponse = await fetch(downloadUrl);
        
        if (!chunkResponse.ok) {
          throw new Error(`Failed to download chunk ${i}: ${chunkResponse.statusText}`);
        }
        
        const chunkBuffer = Buffer.from(await chunkResponse.arrayBuffer());
        
        // Validate chunk is not empty
        if (chunkBuffer.length === 0) {
          this.logger.warn(`Chunk ${i} is empty, skipping...`);
          continue;
        }
        
        // Check if it's a valid WebM/EBML file (starts with EBML header: 0x1A 0x45 0xDF 0xA3)
        const header = chunkBuffer.slice(0, 4);
        const isValidWebM = header.equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        if (!isValidWebM) {
          this.logger.warn(`Chunk ${i} doesn't appear to be a valid WebM file (header: ${header.toString('hex')}), but continuing...`);
        }
        
        await fs.promises.writeFile(chunkPath, chunkBuffer);
        
        // Verify file was written correctly
        const stats = await fs.promises.stat(chunkPath);
        this.logger.log(`Chunk ${i} saved: ${stats.size} bytes`);
        
        chunkPaths.push(chunkPath);
      }
      
      if (chunkPaths.length === 0) {
        throw new Error('No valid chunks found to merge');
      }
      
      this.logger.log(`Validated ${chunkPaths.length} chunks for merging`);

      // Verify chunks are valid WebM files before merging
      this.logger.log('Verifying chunk formats...');
      for (let i = 0; i < chunkPaths.length; i++) {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_format -show_streams "${chunkPaths[i]}" 2>&1`
          );
          this.logger.debug(`Chunk ${i} info: ${stdout.substring(0, 200)}`);
        } catch (error: any) {
          this.logger.warn(`Chunk ${i} verification failed: ${error.message}`);
        }
      }

      // Create concat list file for FFmpeg
      // FFmpeg concat demuxer requires file paths (one per line) prefixed with 'file '
      const concatListContent = chunkPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.promises.writeFile(concatListPath, concatListContent, 'utf-8');

      this.logger.log(`Merging ${chunks.length} chunks using FFmpeg...`);

      // Merge chunks using FFmpeg
      // WebM fragments from MediaRecorder often can't be directly concatenated with -c copy
      // So we'll re-encode to ensure compatibility and proper merging
      // Using VP9 video codec and Opus audio codec (WebM standard)
      this.logger.log('Merging chunks with re-encoding (required for WebM fragments)...');
      
      const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c:v libvpx-vp9 -b:v 2M -c:a libopus -b:a 128k -avoid_negative_ts make_zero -fflags +genpts "${outputPath}" -y`;
      
      try {
        const { stdout, stderr } = await execAsync(ffmpegCommand);
        
        // FFmpeg outputs version info and progress to stderr, which is normal
        // Only log actual errors, not informational output
        if (stderr) {
          // Filter out version info, configuration, and progress messages
          const errorLines = stderr
            .split('\n')
            .filter(line => {
              const lower = line.trim().toLowerCase();
              // Skip all informational messages
              if (lower.includes('ffmpeg version') ||
                  lower.includes('built with') ||
                  lower.includes('configuration:') ||
                  lower.includes('libav') ||
                  lower.includes('copyright') ||
                  lower.includes('estimating duration') ||
                  lower.includes('frame=') ||
                  lower.includes('size=') ||
                  lower.includes('time=') ||
                  lower.includes('bitrate=') ||
                  lower.includes('speed=') ||
                  lower.includes('input #') ||
                  lower.includes('output #') ||
                  lower.includes('stream #') ||
                  lower.includes('duration:') ||
                  lower.includes('start:') ||
                  lower === '') {
                return false;
              }
              // Only include lines that contain actual error/warning keywords
              return lower.includes('error') || 
                     lower.includes('warning') || 
                     lower.includes('failed') ||
                     lower.includes('invalid') ||
                     lower.includes('cannot');
            });
          
          if (errorLines.length > 0) {
            const errorOutput = errorLines.join('\n');
            this.logger.warn(`FFmpeg warnings/errors: ${errorOutput.substring(0, 1000)}`);
          } else {
            // Success - no errors found
            this.logger.debug(`FFmpeg merge completed successfully (output size will be checked)`);
          }
        }
      } catch (ffmpegError: any) {
        // Log the full error for debugging
        this.logger.error(`FFmpeg merge failed: ${ffmpegError.message}`);
        if (ffmpegError.stderr) {
          // Extract actual error messages from stderr
          const errorLines = ffmpegError.stderr
            .split('\n')
            .filter(line => {
              const lower = line.toLowerCase();
              return lower.includes('error') || lower.includes('failed') || lower.includes('invalid');
            });
          if (errorLines.length > 0) {
            this.logger.error(`FFmpeg errors: ${errorLines.join('\n')}`);
          } else {
            this.logger.error(`FFmpeg stderr: ${ffmpegError.stderr.substring(0, 2000)}`);
          }
        }
        throw new Error(`FFmpeg merge failed: ${ffmpegError.message}. Check logs for details.`);
      }

      // Check if output file was created
      if (!fs.existsSync(outputPath)) {
        throw new Error('FFmpeg merge failed: output file not created');
      }

      const outputStats = await fs.promises.stat(outputPath);
      this.logger.log(`Merged video created: ${outputStats.size} bytes`);

      // Read merged video
      const mergedVideoBuffer = await fs.promises.readFile(outputPath);

      // Upload merged video to R2
      const result = await this.videoRecordingService.uploadCompleteVideo(
        interviewId,
        mergedVideoBuffer,
        'video/webm',
      );

      this.logger.log(`✅ Successfully merged and uploaded video: ${result.key}`);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to merge video chunks: ${error.message}`, error.stack);
      throw new Error(`Failed to merge video chunks: ${error.message}`);
    } finally {
      // Cleanup temp files
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup temp directory: ${cleanupError}`);
      }
    }
  }

  /**
   * Concatenate video chunks and mix AI audio using FFmpeg
   * MediaRecorder fragments can be concatenated directly, then normalized once
   * @param interviewId Interview ID
   * @returns R2 key and URL of the final video with mixed audio
   */
  async processVideoChunksWithAudio(interviewId: string): Promise<{ key: string; url: string }> {
    const tempDir = this.tempStorageService.getInterviewTempDir(interviewId);
    const processingDir = path.join(os.tmpdir(), `video-processing-${interviewId}-${Date.now()}`);
    const concatenatedPath = path.join(processingDir, 'concatenated.webm');
    const normalizedPath = path.join(processingDir, 'normalized.webm');
    const finalVideoPath = path.join(processingDir, 'final.webm');

    try {
      // Create processing directory
      await fs.promises.mkdir(processingDir, { recursive: true });

      this.logger.log(`Starting video chunk processing with audio mixing for interview ${interviewId}`);

      // Wait a moment to ensure all file handles are closed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get video chunks
      const chunks = await this.tempStorageService.getVideoChunks(interviewId);

      if (chunks.length === 0) {
        throw new Error('No video chunks found in temp folder');
      }

      this.logger.log(`Found ${chunks.length} video chunks to process`);

      // Step 1: Copy chunks to processing directory and verify they're valid standalone files
      this.logger.log('Preparing video chunks for concatenation...');
      
      const chunkPaths: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const destPath = path.join(processingDir, `chunk-${i}.webm`);
        
        let retries = 3;
        while (retries > 0) {
          try {
            await fs.promises.copyFile(chunk.path, destPath);
            chunkPaths.push(destPath);
            
            const stats = await fs.promises.stat(destPath);
            this.logger.log(`Copied chunk ${i + 1}/${chunks.length}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            
            // Verify chunk is a valid WebM file
            try {
              const { stdout } = await execAsync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${destPath}" 2>&1`
              );
              const duration = parseFloat(stdout.trim());
              this.logger.debug(`Chunk ${i + 1} duration: ${duration.toFixed(2)}s`);
            } catch (probeError) {
              this.logger.warn(`Chunk ${i + 1} may not be a valid WebM file: ${probeError}`);
            }
            
            break;
          } catch (error: any) {
            if (error.code === 'EBUSY' && retries > 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
              retries--;
            } else {
              this.logger.warn(`Failed to copy chunk ${i + 1}, skipping: ${error.message}`);
              break;
            }
          }
        }
      }

      if (chunkPaths.length === 0) {
        throw new Error('No chunks could be copied for processing');
      }

      // Step 2: Concatenate standalone WebM chunks using concat filter
      // Standalone chunks have independent headers and reset timestamps, so we need to use concat filter
      // which properly handles timestamp resets and creates a seamless video
      this.logger.log('Concatenating standalone WebM chunks using concat filter (handles timestamp resets)...');

      // Build input arguments for all chunks
      const chunkInputArgs = chunkPaths.map((p) => `-i "${p}"`).join(' ');

      // Build concat filter - concatenate video and audio streams separately
      // This properly handles timestamp resets in standalone chunks
      const numChunks = chunkPaths.length;
      const filterInputs = chunkPaths
        .map((_, i) => `[${i}:v][${i}:a]`)
        .join('');
      const concatFilter = `${filterInputs}concat=n=${numChunks}:v=1:a=1[outv][outa]`;

      // Use concat filter with re-encoding to fix timestamps and create seamless video
      const concatCommand = `ffmpeg ${chunkInputArgs} -filter_complex "${concatFilter}" -map "[outv]" -map "[outa]" -c:v libvpx-vp9 -b:v 2M -c:a libopus -b:a 128k -avoid_negative_ts make_zero -fflags +genpts "${concatenatedPath}" -y`;
      
      this.logger.debug(`FFmpeg concat filter command: ${concatCommand.substring(0, 200)}...`);
      this.logger.debug(`Concat filter: ${concatFilter}`);
      
      try {
        const { stdout, stderr } = await execAsync(concatCommand, { timeout: 300000 }); // 5 minute timeout
        
        // Log FFmpeg output for debugging
        const outputLines = stderr.split('\n');
        const frameLines = outputLines.filter(line => line.includes('frame=') || line.includes('time='));
        if (frameLines.length > 0) {
          this.logger.debug(`FFmpeg progress: ${frameLines[frameLines.length - 1]}`);
        }
        
        // Check for critical errors
        const criticalErrors = stderr
          .split('\n')
          .filter(line => {
            const lower = line.trim().toLowerCase();
            return (lower.includes('error opening input') || 
                    lower.includes('invalid data found') ||
                    lower.includes('ebml header parsing failed') ||
                    lower.includes('error applying filter') ||
                    lower.includes('failed to read frame')) &&
                   !lower.includes('ffmpeg version');
          });
        
        if (criticalErrors.length > 0) {
          this.logger.warn(`Concatenation warnings: ${criticalErrors.join('; ').substring(0, 500)}`);
        }
        
        // Check for non-monotonic DTS warnings (these are expected with standalone chunks but should be handled)
        const dtsWarnings = stderr.split('\n').filter(line => 
          line.toLowerCase().includes('non-monotonic dts') || 
          line.toLowerCase().includes('backward in time')
        );
        if (dtsWarnings.length > 0) {
          this.logger.debug(`Timestamp warnings (expected with standalone chunks): ${dtsWarnings.length} occurrences`);
        }
      } catch (error: any) {
        this.logger.error(`Concatenation failed: ${error.message}`);
        if (error.stderr) {
          const errorLines = error.stderr
            .split('\n')
            .filter(line => {
              const lower = line.toLowerCase();
              return lower.includes('error') || lower.includes('failed') || lower.includes('invalid');
            });
          if (errorLines.length > 0) {
            this.logger.error(`FFmpeg errors: ${errorLines.join('\n').substring(0, 1000)}`);
          } else {
            // Log full stderr if no obvious errors found
            this.logger.error(`FFmpeg stderr: ${error.stderr.substring(0, 2000)}`);
          }
        }
        throw new Error(`Failed to concatenate video chunks: ${error.message}`);
      }

      if (!fs.existsSync(concatenatedPath)) {
        throw new Error('Concatenated video file was not created');
      }

      if (!fs.existsSync(concatenatedPath)) {
        throw new Error('Concatenated video file was not created');
      }

      const concatStats = await fs.promises.stat(concatenatedPath);
      this.logger.log(`Concatenated video: ${(concatStats.size / 1024 / 1024).toFixed(2)} MB`);

      // Verify the concatenated video has correct duration
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${concatenatedPath}"`
        );
        const duration = parseFloat(stdout.trim());
        this.logger.log(`Concatenated video duration: ${duration.toFixed(2)} seconds (expected ~${(chunkPaths.length * 30).toFixed(0)} seconds)`);
        
        if (duration < chunkPaths.length * 25) {
          this.logger.warn(`⚠️ Video duration (${duration.toFixed(2)}s) is shorter than expected (${chunkPaths.length * 30}s). Some chunks may not have been concatenated properly.`);
        }
      } catch (error: any) {
        this.logger.warn(`Could not verify video duration: ${error.message}`);
      }

      // Step 3: Use concatenated video directly (no normalization needed)
      // Concat filter with re-encoding already fixed timestamps and created a seamless video
      const videoForMixing = concatenatedPath;
      this.logger.log('Using concatenated video directly (concat filter already fixed timestamps)');


      // Step 2: Find TTS audio files and mix them
      const ttsFiles = await this.tempStorageService.getTTSAudioFiles(interviewId);

      this.logger.log(`Found ${ttsFiles.length} TTS audio files to mix`);

      if (ttsFiles.length === 0) {
        // No TTS audio to mix, just upload the video
        this.logger.log('No TTS audio files found, uploading video without audio mixing');
        const videoBuffer = await fs.promises.readFile(videoForMixing);
        const result = await this.videoRecordingService.uploadCompleteVideo(
          interviewId,
          videoBuffer,
          'video/webm',
        );
        await this.tempStorageService.cleanupAfterProcessing(interviewId);
        return result;
      }

      // Step 3: Mix TTS audio with video audio using FFmpeg
      this.logger.log('Mixing TTS audio with video...');

      // Build FFmpeg command with complex filter for audio mixing
      // Input 0: video (has original audio)
      // Inputs 1-N: TTS audio files
      
      // Create filter_complex string
      // First, delay each TTS audio by its start time
      const delayFilters = ttsFiles.map((audio, index) => {
        const delayMs = Math.round(audio.startTime * 1000); // Convert to milliseconds
        return `[${index + 1}:a]adelay=${delayMs}|${delayMs}[a${index}]`;
      });

      // Then mix all delayed TTS audios with the original video audio
      const amixInputs = `[0:a]${ttsFiles.map((_, i) => `[a${i}]`).join('')}`;
      const amixFilter = `${amixInputs}amix=inputs=${ttsFiles.length + 1}:duration=longest:dropout_transition=2[mixed]`;

      const allFilters = [...delayFilters, amixFilter];

      // Build input arguments
      const inputArgs = ttsFiles.map(audio => `-i "${audio.file}"`).join(' ');

      // Build FFmpeg command
      const mixCommand = `ffmpeg -i "${videoForMixing}" ${inputArgs} -filter_complex "${allFilters.join(';')}" -map 0:v -map [mixed] -c:v copy -c:a libopus -b:a 128k "${finalVideoPath}" -y`;

      try {
        const { stderr } = await execAsync(mixCommand);
        // Filter out informational messages
        const errorLines = stderr
          .split('\n')
          .filter(line => {
            const lower = line.trim().toLowerCase();
            return (lower.includes('error') || lower.includes('failed') || lower.includes('invalid')) &&
                   !lower.includes('ffmpeg version') && !lower.includes('frame=') && !lower.includes('time=');
          });
        
        if (errorLines.length > 0) {
          this.logger.warn(`FFmpeg audio mixing warnings: ${errorLines.join('\n').substring(0, 500)}`);
        }
      } catch (error: any) {
        this.logger.error(`FFmpeg audio mixing failed: ${error.message}`);
        // If audio mixing fails, fall back to normalized video without TTS audio
        this.logger.warn('Falling back to normalized video without TTS audio mixing');
        const normalizedVideoBuffer = await fs.promises.readFile(normalizedPath);
        const result = await this.videoRecordingService.uploadCompleteVideo(
          interviewId,
          normalizedVideoBuffer,
          'video/webm',
        );
        await this.tempStorageService.cleanupAfterProcessing(interviewId);
        return result;
      }

      if (!fs.existsSync(finalVideoPath)) {
        throw new Error('Final video with mixed audio not created');
      }

      const finalStats = await fs.promises.stat(finalVideoPath);
      this.logger.log(`Final video with mixed audio created: ${finalStats.size} bytes`);

      // Step 4: Upload final video to R2
      const finalVideoBuffer = await fs.promises.readFile(finalVideoPath);
      const result = await this.videoRecordingService.uploadCompleteVideo(
        interviewId,
        finalVideoBuffer,
        'video/webm',
      );

      this.logger.log(`✅ Successfully processed video and mixed audio: ${result.key}`);

      // Cleanup temp files after processing
      await this.tempStorageService.cleanupAfterProcessing(interviewId);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to process video with audio: ${error.message}`, error.stack);
      throw new Error(`Failed to process video with audio: ${error.message}`);
    } finally {
      // Cleanup processing directory
      try {
        await fs.promises.rm(processingDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up processing directory: ${processingDir}`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup processing directory: ${cleanupError}`);
      }
    }
  }
}
