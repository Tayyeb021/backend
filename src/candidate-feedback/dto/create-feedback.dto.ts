import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsNotEmpty } from 'class-validator';
import { FeedbackOutcomeType, FeedbackDeliveryMethod } from '@prisma/client';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  candidateId: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  interviewId?: string;

  @IsString()
  @IsOptional()
  hiringDecisionId?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsEnum(FeedbackOutcomeType)
  @IsNotEmpty()
  outcomeType: FeedbackOutcomeType;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  @IsOptional()
  includeScores?: boolean;

  @IsArray()
  @IsEnum(FeedbackDeliveryMethod, { each: true })
  @IsOptional()
  deliveryMethod?: FeedbackDeliveryMethod[];
}
