import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, IsNull } from 'typeorm';
import { Interview } from '../../entities/interview.entity';
import { CloudflareR2Service } from '../../storage/cloudflare-r2.service';

@Injectable()
export class DataRetentionService {
  constructor(
    @InjectRepository(Interview)
    private interviewRepository: Repository<Interview>,
    private r2Service: CloudflareR2Service,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldRecordings() {
    console.log('Starting data retention cleanup...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

    try {
      // Find interviews older than 90 days
      const oldInterviews = await this.interviewRepository.find({
        where: {
          completedAt: LessThan(cutoffDate),
          videoUrl: Not(IsNull()),
        },
      });

      console.log(`Found ${oldInterviews.length} interviews to clean up`);

      for (const interview of oldInterviews) {
        if (interview.videoUrl) {
          try {
            // Extract key from URL
            const urlParts = interview.videoUrl.split('/');
            const key = urlParts.slice(-2).join('/'); // Get last two parts (interviewId/filename)

            // Delete from R2
            await this.r2Service.deleteVideo(key);

            // Clear video URL from database
            interview.videoUrl = null;
            await this.interviewRepository.save(interview);

            console.log(`Deleted video for interview ${interview.id}`);
          } catch (error: any) {
            console.error(`Failed to delete video for interview ${interview.id}:`, error);
          }
        }

        // Delete old transcripts (optional - keep summary)
        if (interview.transcript) {
          interview.transcript = null;
          interview.transcriptWithTimestamps = null;
          await this.interviewRepository.save(interview);
        }
      }

      console.log('Data retention cleanup completed');
    } catch (error: any) {
      console.error('Error during data retention cleanup:', error);
    }
  }
}
