import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';

export class WebhookCandidateDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUUID()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  resumeUrl?: string;

  @IsString()
  @IsOptional()
  resumeFile?: string; // Base64 encoded

  @IsString()
  @IsOptional()
  sourcePlatform?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsInt()
  @Min(0)
  @IsOptional()
  experienceYears?: number;

  @IsString()
  @IsOptional()
  location?: string;
}
