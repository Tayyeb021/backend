import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class CloudflareR2Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.R2_BUCKET_NAME || 'falcon-recordings';

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadVideo(
    interviewId: string,
    videoBuffer: Buffer,
    mimeType: string = 'video/webm',
  ): Promise<string> {
    const key = `interviews/${interviewId}/${Date.now()}.webm`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: videoBuffer,
          ContentType: mimeType,
        }),
      );

      // Return public URL (configured in R2 settings)
      return `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`;
    } catch (error: any) {
      throw new Error(`Failed to upload video to R2: ${error.message}`);
    }
  }

  async uploadVideoChunk(
    interviewId: string,
    chunkIndex: number,
    chunkBuffer: Buffer,
  ): Promise<void> {
    const key = `interviews/${interviewId}/chunks/${chunkIndex}.webm`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: chunkBuffer,
          ContentType: 'video/webm',
        }),
      );
    } catch (error: any) {
      throw new Error(`Failed to upload video chunk: ${error.message}`);
    }
  }

  async mergeVideoChunks(
    interviewId: string,
    totalChunks: number,
  ): Promise<string> {
    // In production, you'd use a video processing service to merge chunks
    // For MVP, we'll return the first chunk URL
    const key = `interviews/${interviewId}/chunks/0.webm`;
    return `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`;
  }

  async deleteVideo(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (error: any) {
      throw new Error(`Failed to delete video from R2: ${error.message}`);
    }
  }

  async listOldVideos(olderThanDays: number = 90): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'interviews/',
      });

      const response = await this.s3Client.send(command);
      const oldKeys: string[] = [];

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.LastModified && object.LastModified < cutoffDate) {
            if (object.Key) {
              oldKeys.push(object.Key);
            }
          }
        }
      }

      return oldKeys;
    } catch (error: any) {
      throw new Error(`Failed to list old videos: ${error.message}`);
    }
  }

  async uploadResume(
    candidateId: string,
    resumeBuffer: Buffer,
    mimeType: string = 'application/pdf',
  ): Promise<string> {
    const extension = mimeType === 'application/pdf' ? 'pdf' :
                     mimeType.includes('wordprocessingml') ? 'docx' :
                     mimeType.includes('msword') ? 'doc' : 'txt';
    const key = `resumes/${candidateId}/${Date.now()}.${extension}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: resumeBuffer,
          ContentType: mimeType,
        }),
      );

      // Return public URL (configured in R2 settings)
      return `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`;
    } catch (error: any) {
      throw new Error(`Failed to upload resume to R2: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for direct browser upload
   * @param interviewId Interview ID
   * @param questionId Question ID (optional, for per-question uploads)
   * @param mimeType MIME type of the file
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned URL and key
   */
  async generatePresignedUploadUrl(
    interviewId: string,
    questionId?: string,
    mimeType: string = 'video/webm',
    expiresIn: number = 3600,
  ): Promise<{ url: string; key: string }> {
    const timestamp = Date.now();
    const extension = mimeType.includes('webm') ? 'webm' : 
                     mimeType.includes('mp4') ? 'mp4' : 'webm';
    const key = questionId
      ? `interviews/${interviewId}/answers/${questionId}/${timestamp}.${extension}`
      : `interviews/${interviewId}/${timestamp}.${extension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimeType,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      return { url, key };
    } catch (error: any) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async generatePresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error: any) {
      throw new Error(`Failed to generate presigned download URL: ${error.message}`);
    }
  }

  /**
   * Get the public URL for a file (if public access is enabled)
   */
  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`;
  }
}
