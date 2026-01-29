import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export class CreateRoleSpecDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(['junior', 'mid', 'senior', 'expert'])
  seniorityLevel: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(['full_time', 'part_time', 'contract', 'freelance'])
  employmentType: string;

  @IsEnum(['remote', 'hybrid', 'onsite'])
  workMode: string;

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

  @IsEnum(['new', 'template', 'clone'])
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

  @IsEnum(['junior', 'mid', 'senior', 'expert'])
  @IsOptional()
  seniorityLevel?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(['full_time', 'part_time', 'contract', 'freelance'])
  @IsOptional()
  employmentType?: string;

  @IsEnum(['remote', 'hybrid', 'onsite'])
  @IsOptional()
  workMode?: string;

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
