import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

export class CreateQuestionDto {
  @IsString()
  question: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsInt()
  @Min(0)
  order: number;

  @IsInt()
  @IsOptional()
  @Min(30)
  timeLimit?: number;
}

export class CreateInterviewTemplateDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}
