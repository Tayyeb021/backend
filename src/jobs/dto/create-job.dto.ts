import { IsString, IsNotEmpty, IsArray, IsOptional, IsEnum } from 'class-validator';
import { JobStatus } from '../../entities/job.entity';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  requiredSkills: string[];

  @IsString()
  @IsNotEmpty()
  experienceLevel: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsOptional()
  salaryRange?: string;

  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;
}
