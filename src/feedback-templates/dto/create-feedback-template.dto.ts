import { IsString, IsOptional, IsEnum, IsBoolean, IsNotEmpty } from 'class-validator';
import { FeedbackOutcomeType } from '@prisma/client';

export class CreateFeedbackTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FeedbackOutcomeType)
  @IsNotEmpty()
  outcomeType: FeedbackOutcomeType;

  @IsString()
  @IsNotEmpty()
  template: string;

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
