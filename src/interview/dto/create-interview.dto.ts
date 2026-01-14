import { IsUUID, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { InterviewLanguage } from '../entities/interview.entity';

export class CreateInterviewDto {
  @IsUUID()
  candidateId: string;

  @IsUUID()
  jobId: string;

  @IsEnum(InterviewLanguage)
  language: InterviewLanguage;

  @IsDateString()
  @IsOptional()
  scheduledAt?: Date;
}
