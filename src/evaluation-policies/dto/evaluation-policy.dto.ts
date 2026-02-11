import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class CreateEvaluationPolicyDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  technicalWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  communicationWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  problemSolvingWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  culturalFitWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minPassingScore?: number;

  @IsBoolean()
  @IsOptional()
  scoreNormalization?: boolean;

  @IsBoolean()
  @IsOptional()
  requireEvidence?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  evidenceConfidenceThreshold?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateEvaluationPolicyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  technicalWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  communicationWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  problemSolvingWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  culturalFitWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minPassingScore?: number;

  @IsBoolean()
  @IsOptional()
  scoreNormalization?: boolean;

  @IsBoolean()
  @IsOptional()
  requireEvidence?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  evidenceConfidenceThreshold?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
