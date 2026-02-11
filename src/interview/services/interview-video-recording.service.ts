import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class InterviewVideoRecordingService {
  private readonly logger = new Logger(InterviewVideoRecordingService.name);
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.R2_BUCKET_NAME || 'falcon-recordings';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      this.logger.warn('R2 credentials not configured. Video recording will not work.');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      maxAttempts: 3,
      requestHandler: {
        requestTimeout: 120000, // 120 seconds for large video files
      },
    });
  }

  /**
   * Upload a video chunk to R2 with retry logic
   * @param interviewId Interview ID
   * @param chunkIndex Chunk index (0-based)
   * @param videoBuffer Video chunk buffer
   * @param mimeType MIME type (default: video/webm)
   * @param retries Number of retry attempts (default: 3)
   * @returns R2 key and URL
   */
  async uploadVideoChunk(
    interviewId: string,
    chunkIndex: number,
    videoBuffer: Buffer,
    mimeType: string = 'video/webm',
    retries: number = 3,
  ): Promise<{ key: string; url: string }> {
    const timestamp = Date.now();
    const key = `live-interviews/${interviewId}/chunks/chunk-${chunkIndex}-${timestamp}.webm`;

    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: videoBuffer,
            ContentType: mimeType,
            Metadata: {
              interviewId,
              chunkIndex: chunkIndex.toString(),
              timestamp: timestamp.toString(),
            },
          }),
        );

        this.logger.log(`Uploaded video chunk ${chunkIndex} for interview ${interviewId} (attempt ${attempt})`);

        return {
          key,
          url: `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Failed to upload video chunk ${chunkIndex} (attempt ${attempt}/${retries}): ${error.message}`
        );
        
        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`Failed to upload video chunk after ${retries} attempts: ${lastError?.message}`, lastError?.stack);
    throw new Error(`Failed to upload video chunk after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Delete all existing complete videos for this interview
   * Since we use a consistent key name, we delete all old videos before uploading the new one
   * @param interviewId Interview ID
   * @returns Number of videos deleted
   */
  async deleteAllCompleteVideos(interviewId: string): Promise<number> {
    try {
      const prefix = `live-interviews/${interviewId}/complete/`;
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Contents || response.Contents.length === 0) {
        return 0;
      }

      let deletedCount = 0;
      this.logger.log(`Found ${response.Contents.length} existing complete video(s) for interview ${interviewId}, deleting all...`);
      
      // Delete ALL existing videos (we'll upload a new one with consistent naming)
      for (const object of response.Contents) {
        const key = object.Key;
        if (key) {
          try {
            await this.s3Client.send(
              new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
              })
            );
            deletedCount++;
            this.logger.log(`Deleted existing complete video: ${key}`);
          } catch (error: any) {
            this.logger.warn(`Failed to delete video ${key}: ${error.message}`);
          }
        }
      }
      
      if (deletedCount > 0) {
        this.logger.log(`Successfully deleted ${deletedCount} existing complete video(s) for interview ${interviewId}`);
      }
      
      return deletedCount;
    } catch (error: any) {
      this.logger.warn(`Failed to delete existing complete videos: ${error.message}`);
      return 0;
    }
  }

  /**
   * Upload final complete video to R2 with retry logic
   * If a complete video already exists, it will be replaced
   * @param interviewId Interview ID
   * @param videoBuffer Complete video buffer
   * @param mimeType MIME type (default: video/webm)
   * @param retries Number of retry attempts (default: 3)
   * @returns R2 key and URL
   */
  async uploadCompleteVideo(
    interviewId: string,
    videoBuffer: Buffer,
    mimeType: string = 'video/webm',
    retries: number = 3,
  ): Promise<{ key: string; url: string }> {
    // Delete all existing complete videos before uploading the new one
    // This ensures only one video exists per interview
    await this.deleteAllCompleteVideos(interviewId);
    
    // Determine file extension based on mime type
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    
    // Always use a consistent key format (without timestamp) to ensure only one video per interview
    const key = `live-interviews/${interviewId}/complete/interview.${extension}`;

    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: videoBuffer,
            ContentType: mimeType,
            Metadata: {
              interviewId,
              type: 'complete',
              timestamp: Date.now().toString(),
            },
          }),
        );

        this.logger.log(`Uploaded complete video for interview ${interviewId} (attempt ${attempt})`);

        return {
          key,
          url: `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Failed to upload complete video (attempt ${attempt}/${retries}): ${error.message}`
        );
        
        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`Failed to upload complete video after ${retries} attempts: ${lastError?.message}`, lastError?.stack);
    throw new Error(`Failed to upload complete video after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Generate a presigned URL for direct upload from frontend
   * @param interviewId Interview ID
   * @param chunkIndex Chunk index (optional)
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned URL and key
   */
  async getPresignedUploadUrl(
    interviewId: string,
    chunkIndex?: number,
    expiresIn: number = 3600,
  ): Promise<{ url: string; key: string }> {
    const timestamp = Date.now();
    const key = chunkIndex !== undefined
      ? `live-interviews/${interviewId}/chunks/chunk-${chunkIndex}-${timestamp}.webm`
      : `live-interviews/${interviewId}/complete/interview-${timestamp}.webm`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: 'video/webm',
        Metadata: {
          interviewId,
          ...(chunkIndex !== undefined && { chunkIndex: chunkIndex.toString() }),
          timestamp: timestamp.toString(),
        },
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      return { url, key };
    } catch (error: any) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for video playback
   * @param key R2 object key
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned URL
   */
  async getPresignedPlaybackUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error: any) {
      this.logger.error(`Failed to generate playback URL: ${error.message}`, error.stack);
      throw new Error(`Failed to generate playback URL: ${error.message}`);
    }
  }

  /**
   * List all video chunks for an interview
   * @param interviewId Interview ID
   * @returns Array of chunk keys sorted by chunk index
   */
  async listVideoChunks(interviewId: string): Promise<Array<{ key: string; chunkIndex: number; timestamp: number }>> {
    try {
      const prefix = `live-interviews/${interviewId}/chunks/`;
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      const chunks: Array<{ key: string; chunkIndex: number; timestamp: number }> = [];

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            // Extract chunk index from key: chunk-{index}-{timestamp}.webm
            const match = object.Key.match(/chunk-(\d+)-(\d+)\.webm$/);
            if (match) {
              chunks.push({
                key: object.Key,
                chunkIndex: parseInt(match[1], 10),
                timestamp: parseInt(match[2], 10),
              });
            }
          }
        }
      }

      // Sort by chunk index to ensure correct order
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      this.logger.log(`Found ${chunks.length} video chunks for interview ${interviewId}`);
      return chunks;
    } catch (error: any) {
      this.logger.error(`Failed to list video chunks: ${error.message}`, error.stack);
      throw new Error(`Failed to list video chunks: ${error.message}`);
    }
  }

  /**
   * Get presigned download URL for a chunk
   * @param key R2 object key
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned download URL
   */
  async getChunkDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error: any) {
      this.logger.error(`Failed to generate chunk download URL: ${error.message}`, error.stack);
      throw new Error(`Failed to generate chunk download URL: ${error.message}`);
    }
  }
}
