import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsArray,
  IsEnum,
  IsEmail,
  Matches,
} from 'class-validator';
import { CandidateStatus } from '@prisma/client';

export class CreateCandidateDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in international format (e.g., +971501234567)',
  })
  phone?: string;

  @IsUUID()
  @IsNotEmpty()
  jobId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  sourcePlatform?: string;

  @IsEnum(CandidateStatus)
  @IsOptional()
  status?: CandidateStatus;
}
