import { IsUUID, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { InterviewLanguage } from '@prisma/client';

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
