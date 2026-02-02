import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
   * Upload final complete video to R2 with retry logic
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
    const timestamp = Date.now();
    const key = `live-interviews/${interviewId}/complete/interview-${timestamp}.webm`;

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
              timestamp: timestamp.toString(),
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
}
