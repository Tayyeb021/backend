import { IsOptional, IsString, IsEnum, IsInt, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import {
  JobStatus,
  JobType,
  WorkMode,
  EngagementType,
  BillingType,
  SeniorityLevel,
  ExperienceLevel,
  JobPriority,
} from '@prisma/client';
import { PaginationQueryDto } from './pagination-query.dto';

export class JobQueryDto extends PaginationQueryDto {
  // Text search (searches in title, description, and skills)
  @IsOptional()
  @IsString()
  search?: string;

  // Status filter
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  // Job type filters
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @IsOptional()
  @IsEnum(EngagementType)
  engagementLength?: EngagementType;

  // Experience and seniority filters
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsEnum(SeniorityLevel)
  seniorityLevel?: SeniorityLevel;

  // Location filters
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  // Compensation filters
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSalary?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  // Hiring info filters
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openings?: number;

  @IsOptional()
  @IsDateString()
  hiringDeadlineFrom?: string;

  @IsOptional()
  @IsDateString()
  hiringDeadlineTo?: string;

  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  // Date range filters
  @IsOptional()
  @IsDateString()
  publishedAtFrom?: string;

  @IsOptional()
  @IsDateString()
  publishedAtTo?: string;

  @IsOptional()
  @IsDateString()
  expiresAtFrom?: string;

  @IsOptional()
  @IsDateString()
  expiresAtTo?: string;

  // Created date range filters
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @IsOptional()
  @IsDateString()
  createdAtTo?: string;
}
