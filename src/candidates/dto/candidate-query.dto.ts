import { IsOptional, IsString, IsEnum, IsInt, IsDateString, IsBoolean, IsArray, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CandidateStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../jobs/dto/pagination-query.dto';

export class CandidateQueryDto extends PaginationQueryDto {
  // Text search (searches in name, email, skills)
  @IsOptional()
  @IsString()
  search?: string;

  // Status filter
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  // Job filter
  @IsOptional()
  @IsString()
  jobId?: string;

  // Skills filter (array of skills)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  skills?: string[];

  // Experience filters
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minExperienceYears?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxExperienceYears?: number;

  // Location filter
  @IsOptional()
  @IsString()
  location?: string;

  // Source platform filter
  @IsOptional()
  @IsString()
  sourcePlatform?: string;

  // Date range filters
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @IsOptional()
  @IsDateString()
  createdAtTo?: string;

  // Boolean filters
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasResume?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasInterview?: boolean;
}
