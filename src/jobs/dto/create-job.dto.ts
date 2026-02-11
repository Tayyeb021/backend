import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
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

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  requiredSkills: string[];

  @IsEnum(ExperienceLevel)
  @IsNotEmpty()
  experienceLevel: ExperienceLevel;

  @IsEnum(SeniorityLevel)
  @IsNotEmpty()
  seniorityLevel: SeniorityLevel;

  @IsEnum(JobType)
  @IsNotEmpty()
  jobType: JobType;

  @IsEnum(EngagementType)
  @IsNotEmpty()
  engagementLength: EngagementType;

  @IsEnum(WorkMode)
  @IsNotEmpty()
  workMode: WorkMode;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  minSalary?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @ValidateIf((o) => o.minSalary !== undefined)
  @Max(999999999)
  maxSalary?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(BillingType)
  @IsOptional()
  billingType?: BillingType;

  @IsInt()
  @IsOptional()
  @Min(1)
  openings?: number;

  @IsDateString()
  @IsOptional()
  hiringDeadline?: string;

  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;

  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @IsDateString()
  @IsOptional()
  publishedAt?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  roleSpecId?: string;

  @IsString()
  @IsOptional()
  evaluationPolicyId?: string;
}
