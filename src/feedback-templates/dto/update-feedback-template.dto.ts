import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { FeedbackOutcomeType } from '@prisma/client';

export class UpdateFeedbackTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FeedbackOutcomeType)
  @IsOptional()
  outcomeType?: FeedbackOutcomeType;

  @IsString()
  @IsOptional()
  template?: string;

  @IsBoolean()
  @IsOptional()
  includeScores?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
