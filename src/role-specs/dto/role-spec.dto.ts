import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { SeniorityLevel, JobType, WorkMode } from '@prisma/client';

export class CreateRoleSpecDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(SeniorityLevel)
  seniorityLevel: SeniorityLevel;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(JobType)
  employmentType: JobType;

  @IsEnum(WorkMode)
  workMode: WorkMode;

  @IsString()
  @IsNotEmpty()
  jobDescription: string;

  @IsArray()
  @IsString({ each: true })
  mustHaveSkills: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  niceToHaveSkills?: string[];

  @IsString()
  @IsOptional()
  source?: 'new' | 'template' | 'clone';

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  clonedFromId?: string;

  @IsString()
  @IsOptional()
  evaluationPolicyId?: string;
}

export class UpdateRoleSpecDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(SeniorityLevel)
  @IsOptional()
  seniorityLevel?: SeniorityLevel;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(JobType)
  @IsOptional()
  employmentType?: JobType;

  @IsEnum(WorkMode)
  @IsOptional()
  workMode?: WorkMode;

  @IsString()
  @IsOptional()
  jobDescription?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mustHaveSkills?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  niceToHaveSkills?: string[];

  @IsString()
  @IsOptional()
  evaluationPolicyId?: string;
}
