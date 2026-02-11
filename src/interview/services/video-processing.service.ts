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
   * Fast & Safe WebM Chunk Processing Pipeline
   * Based on concat-webm-chunks.js reference implementation
   * 
   * Pipeline:
   * 1. Concat WebM chunks directly using concat demuxer (single encode)
   * 2. Optional audio mix (video copy, only audio re-encode) -c:v copy
   * 3. Final encode (only once, video encoding) - already done in step 1 if no audio mixing
   * 
   * @param interviewId Interview ID
   * @returns R2 key and URL of the final video with mixed audio
   */
  async processVideoChunksWithAudio(interviewId: string, actualDuration?: number): Promise<{ key: string; url: string }> {
    const tempDir = this.tempStorageService.getInterviewTempDir(interviewId);
    const processingDir = path.join(os.tmpdir(), `video-processing-${interviewId}-${Date.now()}`);
    const concatListPath = path.join(processingDir, 'concat-list.txt');
    const concatenatedPath = path.join(processingDir, 'concatenated.mp4');

    try {
      // Create processing directory
      await fs.promises.mkdir(processingDir, { recursive: true });

      this.logger.log(`Starting video chunk processing pipeline for interview ${interviewId}`);

      // Get video chunks
      let chunks = await this.tempStorageService.getVideoChunks(interviewId);
      
      // Wait a moment to ensure all file handles are closed and all chunks are uploaded
      // Also wait for any in-flight uploads to complete
      this.logger.log('Waiting for all chunks to be fully uploaded...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
      
      // Re-check chunks after wait to catch any that arrived late
      const finalChunks = await this.tempStorageService.getVideoChunks(interviewId);
      if (finalChunks.length > chunks.length) {
        this.logger.log(`Found ${finalChunks.length - chunks.length} additional chunk(s) after initial wait, updating...`);
        chunks = finalChunks;
      }

      if (chunks.length === 0) {
        throw new Error('No video chunks found in temp folder');
      }

      // Also check temp directory directly to see all files (for debugging)
      try {
        const allFiles = await fs.promises.readdir(tempDir);
        const chunkFiles = allFiles.filter(f => f.startsWith('chunk-') && f.endsWith('.webm'));
        this.logger.log(`📁 Temp directory contains ${chunkFiles.length} chunk files: ${chunkFiles.sort().join(', ')}`);
        
        if (chunkFiles.length !== chunks.length) {
          this.logger.warn(`⚠️ Mismatch: Found ${chunkFiles.length} chunk files in directory, but ${chunks.length} chunks detected by service`);
        }
      } catch (error: any) {
        this.logger.warn(`Could not list temp directory files: ${error.message}`);
      }

      this.logger.log(`Found ${chunks.length} video chunks to process`);

      // ============================================
      // DEDUPLICATE CHUNKS: Remove duplicates by index (keep latest)
      // ============================================
      // If same chunk index appears multiple times, keep only the latest one
      const originalChunkCount = chunks.length;
      const chunkMap = new Map<number, { path: string; index: number }>();
      for (const chunk of chunks) {
        const existing = chunkMap.get(chunk.index);
        if (!existing) {
          chunkMap.set(chunk.index, chunk);
        } else {
          // Same index found - check which file is newer
          try {
            const existingStats = await fs.promises.stat(existing.path);
            const currentStats = await fs.promises.stat(chunk.path);
            if (currentStats.mtime > existingStats.mtime) {
              // Current file is newer, replace
              this.logger.warn(`⚠️ Duplicate chunk index ${chunk.index} found. Keeping newer file.`);
              chunkMap.set(chunk.index, chunk);
            } else {
              this.logger.warn(`⚠️ Duplicate chunk index ${chunk.index} found. Keeping existing file.`);
            }
          } catch (error: any) {
            // If we can't compare, keep the first one
            this.logger.warn(`⚠️ Duplicate chunk index ${chunk.index} found. Keeping first file.`);
          }
        }
      }

      // Convert map back to array and sort
      chunks = Array.from(chunkMap.values()).sort((a, b) => a.index - b.index);

      if (originalChunkCount > chunks.length) {
        this.logger.warn(`⚠️ Removed ${originalChunkCount - chunks.length} duplicate chunk(s). Processing ${chunks.length} unique chunks.`);
      }

      this.logger.log(`Processing ${chunks.length} unique chunks (indices: ${chunks.map(c => c.index).join(', ')})`);

      // ============================================
      // VALIDATE CHUNKS: Process all available chunks (skip invalid ones)
      // ============================================
      this.logger.log(`Validating ${chunks.length} chunk files (will process all valid chunks)...`);
      
      // Sort chunks by original index
      const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);
      
      // Validate chunks - skip invalid ones, process what's available
      const validatedChunks: Array<{ path: string; originalIndex: number; sequentialIndex: number; size: number; duration: number }> = [];
      
      for (const chunk of sortedChunks) {
        try {
          // Check file exists and is readable
          const stats = await fs.promises.stat(chunk.path);
          if (stats.size === 0) {
            this.logger.warn(`⚠️ Chunk ${chunk.index} is empty (0 bytes), skipping...`);
            continue;
          }
          
          // Validate chunk with ffprobe (try to get duration, but don't fail if unavailable)
          let duration: number | null = null;
          try {
            const { stdout, stderr } = await execAsync(
              `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${chunk.path}" 2>&1`
            );
            const durationStr = stdout.trim();
            
            // Check if stdout contains a valid number
            if (durationStr && !isNaN(parseFloat(durationStr))) {
              duration = parseFloat(durationStr);
              if (duration <= 0) {
                this.logger.warn(`⚠️ Chunk ${chunk.index} has non-positive duration: ${duration}, will estimate`);
                duration = null;
              }
            } else {
              // Duration not available (common for incomplete WebM chunks)
              this.logger.debug(`⚠️ Chunk ${chunk.index} duration not available from ffprobe (stdout: "${durationStr}", stderr: "${stderr.trim()}"). This is normal for MediaRecorder WebM chunks.`);
              duration = null;
            }
          } catch (probeError: any) {
            // ffprobe failed, but this is OK for WebM chunks - they might not have duration metadata
            this.logger.debug(`⚠️ Chunk ${chunk.index} ffprobe failed: ${probeError.message}. This is normal for incomplete WebM chunks.`);
            duration = null;
          }
          
          // Estimate duration if not available (based on file size: ~2.5 Mbps = ~0.3 MB per second)
          const sequentialIndex = validatedChunks.length;
          if (duration === null) {
            const estimatedDuration = (stats.size / (2.5 * 1024 * 1024 / 8));
            duration = estimatedDuration;
            this.logger.log(`✅ Chunk ${chunk.index} (sequential: ${sequentialIndex}): ${(stats.size / 1024 / 1024).toFixed(2)} MB, estimated duration: ${duration.toFixed(2)}s (duration metadata not available)`);
          } else {
            this.logger.log(`✅ Chunk ${chunk.index} (sequential: ${sequentialIndex}): ${(stats.size / 1024 / 1024).toFixed(2)} MB, duration: ${duration.toFixed(2)}s`);
          }
          
          // Re-index sequentially (0, 1, 2, 3...) regardless of original indices
          // Use estimated duration if actual duration is not available
          validatedChunks.push({
            path: chunk.path,
            originalIndex: chunk.index,
            sequentialIndex: sequentialIndex, // Sequential index
            size: stats.size,
            duration: duration, // Use estimated if actual not available
          });
        } catch (error: any) {
          this.logger.warn(`⚠️ Failed to validate chunk ${chunk.index}: ${error.message}, skipping...`);
          continue;
        }
      }
      
      if (validatedChunks.length === 0) {
        throw new Error(`No valid chunks found to process`);
      }
      
      if (validatedChunks.length < chunks.length) {
        this.logger.warn(`⚠️ Only ${validatedChunks.length} of ${chunks.length} chunks are valid. Processing available chunks.`);
      }
      
      // Log chunk summary with expected vs actual duration
      const totalSize = validatedChunks.reduce((sum, c) => sum + c.size, 0);
      const totalDuration = validatedChunks.reduce((sum, c) => sum + c.duration, 0);
      
      // Calculate expected duration based on chunk count
      // First chunks are typically 30s, last chunk may be partial (< 30s) if user ended interview early
      // So expected duration is: (n-1) * 30s + last chunk actual duration
      const expectedDuration = validatedChunks.length > 0
        ? (validatedChunks.length - 1) * 30 + validatedChunks[validatedChunks.length - 1].duration
        : 0;
      
      // Log individual chunk durations for debugging
      this.logger.log(`📊 Chunk durations: ${validatedChunks.map(c => `${c.originalIndex}:${c.duration.toFixed(1)}s`).join(', ')}`);
      
      this.logger.log(`✅ ${validatedChunks.length} chunks validated and ready to process`);
      this.logger.log(`📊 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      this.logger.log(`📊 Total duration: ${totalDuration.toFixed(2)}s (expected: ~${expectedDuration.toFixed(2)}s)`);
      
      // Warn if duration is significantly longer than expected
      if (expectedDuration > 0 && totalDuration > expectedDuration * 1.5) {
        this.logger.warn(`⚠️ WARNING: Total chunk duration (${totalDuration.toFixed(2)}s) is ${((totalDuration / expectedDuration - 1) * 100).toFixed(1)}% longer than expected (${expectedDuration.toFixed(2)}s)`);
        this.logger.warn(`This may indicate duplicate chunks or chunks from a previous interview`);
      }
      
      // Log original vs sequential mapping
      if (validatedChunks.some(c => c.originalIndex !== c.sequentialIndex)) {
        this.logger.log(`📋 Chunk index mapping (original -> sequential):`);
        validatedChunks.forEach(c => {
          if (c.originalIndex !== c.sequentialIndex) {
            this.logger.log(`   ${c.originalIndex} -> ${c.sequentialIndex}`);
          }
        });
      }

      // ============================================
      // STEP 1: CONCAT WEBM CHUNKS (SINGLE ENCODE)
      // ============================================
      // Based on concat-webm-chunks.js - directly concat WebM chunks and encode to MP4
      this.logger.log('STEP 1: Concatenating WebM chunks using concat demuxer (single encode)...');
      
      // Copy chunks to processing directory using sequential indices (0, 1, 2, 3...)
      const chunkPaths: string[] = [];
      for (let i = 0; i < validatedChunks.length; i++) {
        const chunk = validatedChunks[i];
        // Use sequential index for concat (0, 1, 2, 3...) regardless of original indices
        const destPath = path.join(processingDir, `chunk-${chunk.sequentialIndex}.webm`);
        
        let retries = 3;
        while (retries > 0) {
          try {
            await fs.promises.copyFile(chunk.path, destPath);
            
            // Verify copied file
            const copiedStats = await fs.promises.stat(destPath);
            if (copiedStats.size !== chunk.size) {
              throw new Error(`Copy size mismatch: expected ${chunk.size}, got ${copiedStats.size}`);
            }
            
            chunkPaths.push(destPath);
            const indexInfo = chunk.originalIndex !== chunk.sequentialIndex 
              ? `(original: ${chunk.originalIndex}, sequential: ${chunk.sequentialIndex})`
              : `(index: ${chunk.originalIndex})`;
            this.logger.log(`Copied chunk ${i + 1}/${validatedChunks.length} ${indexInfo}: ${(chunk.size / 1024 / 1024).toFixed(2)} MB, ${chunk.duration.toFixed(2)}s`);
            break;
          } catch (error: any) {
            if (error.code === 'EBUSY' && retries > 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
              retries--;
            } else {
              this.logger.error(`❌ Failed to copy chunk ${i + 1} (original index ${chunk.originalIndex}): ${error.message}`);
              throw new Error(`Failed to copy chunk ${i + 1} (original index ${chunk.originalIndex}): ${error.message}`);
            }
          }
        }
      }

      if (chunkPaths.length !== validatedChunks.length) {
        throw new Error(`Chunk copy failed: Only ${chunkPaths.length} of ${validatedChunks.length} chunks were copied`);
      }
      
      this.logger.log(`✅ All ${chunkPaths.length} chunks copied successfully`);

      // Create concat list file (normalize paths for Windows compatibility)
      const concatListContent = chunkPaths
        .map(p => p.replace(/\\/g, '/'))
        .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n');
      await fs.promises.writeFile(concatListPath, concatListContent, 'utf-8');
      
      // Log concat list for debugging
      this.logger.log(`📝 Concat list created with ${chunkPaths.length} chunks:`);
      chunkPaths.forEach((p, i) => {
        const chunk = validatedChunks[i];
        const indexInfo = chunk.originalIndex !== chunk.sequentialIndex 
          ? `(original: ${chunk.originalIndex}, sequential: ${chunk.sequentialIndex})`
          : `(index: ${chunk.originalIndex})`;
        this.logger.log(`   ${i + 1}. ${path.basename(p)} ${indexInfo}`);
      });

      // Concat and encode in one step
      // CRITICAL: Do NOT parse stderr for errors - decoder warnings are expected with MediaRecorder WebM chunks
      // Only fail based on exit code and output file existence
      // Using exact flags as specified:
      // -loglevel warning: Reduce log verbosity
      // -fflags +discardcorrupt+genpts: Discard corrupt frames, generate PTS
      // -err_detect ignore_err: Ignore decoder errors
      // -ignore_unknown: Ignore unknown stream types
      // -vsync vfr -async 1: Variable frame rate, async audio
      // -map 0:v? -map 0:a?: Map video/audio if available (optional mapping)
      // -t: Trim output to exact interview duration (prevents duration mismatch from WebM timestamp issues)
      
      // Build duration limit flag if actual duration is known from frontend
      // This ensures the final video is exactly the same length as the interview
      let durationFlag = '';
      if (actualDuration && actualDuration > 0) {
        // Add a small buffer (1 second) to avoid cutting off the very end
        const trimDuration = actualDuration + 1;
        durationFlag = `-t ${trimDuration.toFixed(2)}`;
        this.logger.log(`📊 Will trim output to ${trimDuration.toFixed(2)}s (actual interview: ${actualDuration.toFixed(2)}s + 1s buffer)`);
      } else {
        this.logger.warn(`⚠️ No actual duration available - output duration will depend on chunk timestamps`);
      }
      
      const concatCommand = `ffmpeg -loglevel warning -fflags +discardcorrupt+genpts -err_detect ignore_err -ignore_unknown -f concat -safe 0 -i "${concatListPath}" -map 0:v? -map 0:a? -vsync vfr -async 1 -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v 2M -c:a aac -ar 48000 -b:a 128k ${durationFlag} -movflags +faststart "${concatenatedPath}" -y`;
      
      const startTime = Date.now();
      
      try {
        // Execute FFmpeg - capture both stdout and stderr but don't parse stderr for errors
        // CRITICAL: Do NOT parse stderr for error keywords - decoder warnings are expected
        const { stdout, stderr } = await execAsync(concatCommand);
        const concatTime = Date.now() - startTime;
        
        // CRITICAL: Only check output file - ignore stderr content completely
        // FFmpeg warnings in stderr are expected and normal for MediaRecorder WebM chunks
        
        // Verify output file exists (MANDATORY check)
        if (!fs.existsSync(concatenatedPath)) {
          throw new Error('FFmpeg did not create output file');
        }
        
        const concatStats = await fs.promises.stat(concatenatedPath);
        
        // Verify output file is not empty (MANDATORY check)
        if (concatStats.size === 0) {
          throw new Error('Output file is empty (0 bytes)');
        }
        
        // Optional safety check: file size should be reasonable (> 100 KB)
        if (concatStats.size < 100 * 1024) {
          this.logger.warn(`⚠️ Output file is very small: ${(concatStats.size / 1024).toFixed(2)} KB (expected > 100 KB)`);
          // Don't throw - just warn, as short interviews might be valid
        }
        
        this.logger.log(`✅ FFmpeg completed successfully (exit code 0)`);
        this.logger.log(`✅ Output file created: ${(concatStats.size / 1024 / 1024).toFixed(2)} MB in ${(concatTime / 1000).toFixed(1)}s`);
        
        // Log stderr for debugging only (never treat as error)
        if (stderr && stderr.trim().length > 0) {
          this.logger.debug(`FFmpeg stderr (informational only, decoder warnings are normal): ${stderr.substring(0, 500)}...`);
        }
        
        // Optional validation: Check output video duration (informational only, don't fail)
        try {
          const { stdout: probeStdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${concatenatedPath}" 2>&1`
          );
          const outputDuration = parseFloat(probeStdout.trim());
          
          if (!isNaN(outputDuration) && outputDuration > 0) {
            const expectedDuration = validatedChunks.reduce((sum, c) => sum + c.duration, 0);
            this.logger.log(`📊 Output video duration: ${outputDuration.toFixed(2)}s (chunk sum: ${expectedDuration.toFixed(2)}s from ${validatedChunks.length} chunks)`);
            
            // Log comparison with actual interview duration if available
            if (actualDuration && actualDuration > 0) {
              const durationDiff = Math.abs(outputDuration - actualDuration);
              if (durationDiff > 2) {
                this.logger.warn(`⚠️ Output duration (${outputDuration.toFixed(2)}s) differs from actual interview duration (${actualDuration.toFixed(2)}s) by ${durationDiff.toFixed(2)}s`);
              } else {
                this.logger.log(`✅ Output duration matches actual interview duration (diff: ${durationDiff.toFixed(2)}s)`);
              }
            }
            
            // Optional safety check: duration should be reasonable (> 1 second)
            if (outputDuration < 1) {
              this.logger.warn(`⚠️ Output video duration is very short: ${outputDuration.toFixed(2)}s (expected > 1s)`);
              // Don't throw - just warn
            }
          }
        } catch (probeError: any) {
          // Don't fail if duration check fails - it's optional validation
          this.logger.debug(`Could not verify video duration: ${probeError.message}`);
        }
        
        this.logger.log(`✅ STEP 1 complete: Concatenated ${chunkPaths.length} chunks in ${(concatTime / 1000).toFixed(1)}s: ${(concatStats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (error: any) {
        // CRITICAL: Only fail based on exit code and output file - ignore stderr content completely
        // execAsync throws an error if exit code is non-zero, but output file might still exist
        
        // Check if output file was created (this is the ONLY real check)
        const outputExists = fs.existsSync(concatenatedPath);
        
        if (outputExists) {
          // Output file exists - verify it's valid
          try {
            const stats = await fs.promises.stat(concatenatedPath);
            if (stats.size === 0) {
              throw new Error('Output file is empty (0 bytes)');
            }
            
            // File exists and has content - FFmpeg succeeded despite non-zero exit code
            // This can happen with decoder warnings - output is still valid
            const concatTime = Date.now() - startTime;
            this.logger.log(`✅ FFmpeg output file exists and is valid (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            this.logger.debug(`Note: FFmpeg may have reported warnings/errors but output was created successfully`);
            
            // Optional: Log exit code for debugging (but don't fail)
            if (error.code !== undefined) {
              this.logger.debug(`FFmpeg exit code was ${error.code} but output file is valid - continuing`);
            }
            
            // Continue processing - output file is valid
            this.logger.log(`✅ STEP 1 complete: Concatenated ${chunkPaths.length} chunks in ${(concatTime / 1000).toFixed(1)}s: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          } catch (statError: any) {
            // Output file exists but is invalid
            this.logger.error(`❌ Output file exists but is invalid: ${statError.message}`);
            throw new Error(`Output file is invalid: ${statError.message}`);
          }
        } else {
          // Output file doesn't exist - this is a REAL failure
          this.logger.error(`❌ FFmpeg did not create output file`);
          if (error.code !== undefined) {
            this.logger.error(`FFmpeg exit code: ${error.code}`);
          }
          // Log stderr for debugging only (don't parse for errors)
          if (error.stderr) {
            this.logger.debug(`FFmpeg stderr (for debugging): ${error.stderr.substring(0, 1000)}`);
          }
          throw new Error(`FFmpeg did not create output file. Exit code: ${error.code || 'unknown'}`);
        }
      }

      // ============================================
      // STEP 2: OPTIONAL AUDIO MIX (NO VIDEO RE-ENCODE)
      // ============================================
      const ttsFiles = await this.tempStorageService.getTTSAudioFiles(interviewId);
      let videoForFinal = concatenatedPath;
      
      if (ttsFiles.length > 0) {
        this.logger.log(`STEP 2: Mixing ${ttsFiles.length} TTS audio files (video copy, audio re-encode only)...`);
        
        // Log TTS audio timeline summary
        const firstTTS = ttsFiles[0];
        const lastTTS = ttsFiles[ttsFiles.length - 1];
        this.logger.log(`📊 TTS audio timeline: first at ${firstTTS.startTime.toFixed(2)}s, last at ${lastTTS.startTime.toFixed(2)}s`);
        this.logger.log(`📊 TTS timestamps use video-relative time (accounts for upload gaps between chunks)`);
        
        const mixedAudioPath = path.join(processingDir, 'with_audio.mp4');
        
        // Build audio mixing command
        // -c:v copy: Video stream copy (no re-encode)
        // -c:a aac: Audio re-encode only
        // amix: Mix multiple audio inputs
        const audioInputArgs = ttsFiles.map(audio => `-i "${audio.file}"`).join(' ');
        
        // Create delay filters for each TTS audio
        // Log each TTS file's position for debugging
        const delayFilters = ttsFiles.map((audio, index) => {
          const delayMs = Math.round(audio.startTime * 1000);
          this.logger.log(`   TTS ${index}: delay=${delayMs}ms (${audio.startTime.toFixed(2)}s), file=${path.basename(audio.file)}`);
          return `[${index + 1}:a]adelay=${delayMs}|${delayMs}[a${index}]`;
        });
        
        // Mix all audio inputs
        // CRITICAL: Use duration=first so the mixed audio matches the video's original duration
        // Using duration=longest would extend the output if a TTS audio + its delay exceeds the video length
        const amixInputs = `[0:a]${ttsFiles.map((_, i) => `[a${i}]`).join('')}`;
        const amixFilter = `${amixInputs}amix=inputs=${ttsFiles.length + 1}:duration=first:dropout_transition=2[mixed]`;
        const allFilters = [...delayFilters, amixFilter];
        
        const mixCommand = `ffmpeg -i "${concatenatedPath}" ${audioInputArgs} -filter_complex "${allFilters.join(';')}" -map 0:v -map [mixed] -c:v copy -c:a aac -ar 48000 -b:a 128k -movflags +faststart "${mixedAudioPath}" -y`;
        
        try {
          const mixStart = Date.now();
          // CRITICAL: Do NOT parse stderr for errors - only check exit code and output file
          const { stderr } = await execAsync(mixCommand);
          const mixTime = Date.now() - mixStart;
          
          // Verify output file exists (MANDATORY check)
          if (!fs.existsSync(mixedAudioPath)) {
            throw new Error('Audio mixed file was not created');
          }
          
          const mixStats = await fs.promises.stat(mixedAudioPath);
          
          // Verify output file is not empty (MANDATORY check)
          if (mixStats.size === 0) {
            throw new Error('Audio mixed file is empty (0 bytes)');
          }
          
          videoForFinal = mixedAudioPath;
          this.logger.log(`✅ STEP 2 complete: Audio mixed in ${(mixTime / 1000).toFixed(1)}s: ${(mixStats.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (error: any) {
          // CRITICAL: Only fail based on exit code and output file - ignore stderr content
          // Check if output file was created despite error
          const outputExists = fs.existsSync(mixedAudioPath);
          
          if (outputExists) {
            // Output file exists - verify it's valid
            try {
              const stats = await fs.promises.stat(mixedAudioPath);
              if (stats.size === 0) {
                throw new Error('Output file is empty (0 bytes)');
              }
              
              // File exists and has content - FFmpeg succeeded despite error
              this.logger.log(`✅ Audio mixing output file exists and is valid (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
              this.logger.debug(`Note: FFmpeg may have reported warnings but output was created successfully`);
              videoForFinal = mixedAudioPath;
            } catch (statError: any) {
              // Output file exists but is invalid - continue without audio mixing
              this.logger.warn(`⚠️ Audio mixing output file is invalid: ${statError.message}`);
              this.logger.warn('⚠️ Continuing without TTS audio mixing');
              videoForFinal = concatenatedPath;
            }
          } else {
            // Output file doesn't exist - continue without audio mixing (non-fatal)
            this.logger.warn(`⚠️ Audio mixing failed: ${error.message}`);
            this.logger.warn('⚠️ Continuing without TTS audio mixing');
            videoForFinal = concatenatedPath;
          }
        }
      } else {
        this.logger.log('STEP 2: No TTS audio files found, skipping audio mix');
      }

      // Final video is ready (already encoded in step 1, or with audio mixed in step 2)
      // Verify total processing time
      const totalTime = Date.now() - startTime;
      const totalMinutes = totalTime / 1000 / 60;
      this.logger.log(`⏱️ Total processing time: ${totalMinutes.toFixed(1)} minutes`);
      if (totalMinutes > 10) {
        this.logger.warn(`⚠️ Processing took ${totalMinutes.toFixed(1)} minutes (target: <10 minutes)`);
      }

      // ============================================
      // UPLOAD FINAL VIDEO
      // ============================================
      this.logger.log('Uploading final video to R2...');
      const finalVideoBuffer = await fs.promises.readFile(videoForFinal);
      const result = await this.videoRecordingService.uploadCompleteVideo(
        interviewId,
        finalVideoBuffer,
        'video/mp4', // MP4 format
      );

      this.logger.log(`✅ Successfully processed video: ${result.key}`);

      // Cleanup temp files after processing
      await this.tempStorageService.cleanupAfterProcessing(interviewId);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to process video: ${error.message}`, error.stack);
      throw new Error(`Failed to process video: ${error.message}`);
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
