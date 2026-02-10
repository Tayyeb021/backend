import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InterviewTempStorageService {
  private readonly logger = new Logger(InterviewTempStorageService.name);
  private readonly baseTempDir: string;

  constructor() {
    // Use project-relative temp folder instead of system temp
    // This ensures it works consistently across deployments
    const projectRoot = process.cwd();
    this.baseTempDir = path.join(projectRoot, 'temp', 'interviews');
    
    // Ensure base temp directory exists
    if (!fs.existsSync(this.baseTempDir)) {
      fs.mkdirSync(this.baseTempDir, { recursive: true });
      this.logger.log(`Created temp directory: ${this.baseTempDir}`);
    }
  }

  /**
   * Get temp directory path for a specific interview
   * @param interviewId Interview ID
   * @returns Full path to interview temp directory
   */
  getInterviewTempDir(interviewId: string): string {
    return path.join(this.baseTempDir, interviewId);
  }

  /**
   * Clean up temp folder for an interview (remove all files)
   * This should be called before starting a new interview to ensure no old files are mixed in
   * @param interviewId Interview ID
   */
  async cleanupInterviewTempDir(interviewId: string): Promise<void> {
    const tempDir = this.getInterviewTempDir(interviewId);
    
    try {
      if (fs.existsSync(tempDir)) {
        // Remove all files in the directory
        const files = await fs.promises.readdir(tempDir);
        
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          try {
            const stats = await fs.promises.stat(filePath);
            if (stats.isFile()) {
              await fs.promises.unlink(filePath);
              this.logger.debug(`Deleted old file: ${file}`);
            } else if (stats.isDirectory()) {
              await fs.promises.rm(filePath, { recursive: true, force: true });
              this.logger.debug(`Deleted old directory: ${file}`);
            }
          } catch (error: any) {
            // If file is locked (EBUSY), try again after a short delay
            if (error.code === 'EBUSY' || error.code === 'ENOENT') {
              this.logger.warn(`File ${file} is locked or doesn't exist, skipping: ${error.message}`);
              continue;
            }
            this.logger.warn(`Failed to delete ${file}: ${error.message}`);
          }
        }
        
        this.logger.log(`Cleaned up temp directory for interview ${interviewId} (removed ${files.length} items)`);
      } else {
        // Directory doesn't exist, create it
        await fs.promises.mkdir(tempDir, { recursive: true });
        this.logger.debug(`Created temp directory for interview ${interviewId}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to cleanup temp directory for interview ${interviewId}: ${error.message}`);
      // Don't throw - we'll try to create the directory anyway
      try {
        await fs.promises.mkdir(tempDir, { recursive: true });
      } catch (mkdirError: any) {
        this.logger.error(`Failed to create temp directory: ${mkdirError.message}`);
        throw new Error(`Failed to setup temp directory for interview: ${mkdirError.message}`);
      }
    }
  }

  /**
   * Ensure temp directory exists for an interview
   * @param interviewId Interview ID
   */
  async ensureTempDirExists(interviewId: string): Promise<string> {
    const tempDir = this.getInterviewTempDir(interviewId);
    await fs.promises.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Get all video chunks for an interview
   * @param interviewId Interview ID
   * @returns Array of chunk file paths sorted by chunk index
   */
  async getVideoChunks(interviewId: string): Promise<Array<{ path: string; index: number }>> {
    const tempDir = this.getInterviewTempDir(interviewId);
    
    if (!fs.existsSync(tempDir)) {
      return [];
    }

    const files = await fs.promises.readdir(tempDir);
    const chunks = files
      .filter(f => f.startsWith('chunk-') && f.endsWith('.webm'))
      .map(f => {
        const match = f.match(/chunk-(\d+)\.webm/);
        if (match) {
          return {
            path: path.join(tempDir, f),
            index: parseInt(match[1], 10),
          };
        }
        return null;
      })
      .filter((c): c is { path: string; index: number } => c !== null)
      .sort((a, b) => a.index - b.index);

    return chunks;
  }

  /**
   * Get all TTS audio files for an interview
   * @param interviewId Interview ID
   * @returns Array of TTS audio files with timestamps
   */
  async getTTSAudioFiles(interviewId: string): Promise<Array<{ file: string; startTime: number }>> {
    const tempDir = this.getInterviewTempDir(interviewId);
    
    if (!fs.existsSync(tempDir)) {
      return [];
    }

    const files = await fs.promises.readdir(tempDir);
    const ttsFiles = files
      .filter(f => f.startsWith('tts-') && f.endsWith('.mp3'))
      .map(f => {
        const match = f.match(/tts-(\d+)\.mp3/);
        if (match) {
          return {
            file: path.join(tempDir, f),
            startTime: parseFloat(match[1]) / 1000, // Convert milliseconds to seconds
          };
        }
        return null;
      })
      .filter((f): f is { file: string; startTime: number } => f !== null)
      .sort((a, b) => a.startTime - b.startTime);

    return ttsFiles;
  }

  /**
   * Clean up temp directory after processing is complete
   * @param interviewId Interview ID
   */
  async cleanupAfterProcessing(interviewId: string): Promise<void> {
    const tempDir = this.getInterviewTempDir(interviewId);
    
    try {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up temp directory after processing for interview ${interviewId}`);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to cleanup temp directory after processing: ${error.message}`);
      // Don't throw - cleanup failure is not critical
    }
  }
}
