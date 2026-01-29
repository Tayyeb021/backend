import { IsString, IsOptional, IsArray, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TestResultDto {
  @IsString()
  name: string;

  @IsString()
  input: string;

  @IsString()
  expected: string;

  @IsOptional()
  @IsString()
  output?: string;

  @IsString()
  passed: boolean;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  executionTime?: string;
}

export class SubmitAssessmentDto {
  @IsString()
  codeSubmission: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestResultDto)
  testResults: TestResultDto[];

  @IsInt()
  @IsOptional()
  score?: number;

  @IsInt()
  @IsOptional()
  timeSpent?: number;
}
