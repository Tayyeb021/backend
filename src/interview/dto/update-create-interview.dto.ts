import { IsUUID, IsEnum, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { InterviewLanguage, InterviewType } from '@prisma/client';

export class CreateInterviewDto {
  @IsUUID()
  candidateId: string;

  @IsUUID()
  jobId: string;

  @IsEnum(InterviewLanguage)
  language: InterviewLanguage;

  @IsEnum(InterviewType)
  @IsOptional()
  type?: InterviewType;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: Date;

  @IsBoolean()
  @IsOptional()
  allowSelfScheduling?: boolean;

  @IsDateString()
  @IsOptional()
  deadline?: Date;
}
