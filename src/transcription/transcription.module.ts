import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TranscriptionGateway } from './transcription.gateway';
import { InterviewModule } from '../interview/interview.module';

@Module({
  imports: [
    InterviewModule, // Import to access LiveInterviewDeepgramService
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [TranscriptionGateway],
})
export class TranscriptionModule {}
