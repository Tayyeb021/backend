import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsInt,
  IsDateString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TestCaseDto {
  @IsString()
  name: string;

  @IsString()
  input: string;

  @IsString()
  expected: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateAssessmentDto {
  @IsUUID()
  candidateId: string;

  @IsUUID()
  jobId: string;

  @IsOptional()
  @IsUUID()
  interviewId?: string;

  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  testCases: TestCaseDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
