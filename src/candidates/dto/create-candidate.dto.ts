import { IsString, IsNotEmpty, IsUUID, IsOptional, IsArray, IsEnum } from 'class-validator';
import { CandidateStatus } from '../../entities/candidate.entity';

export class CreateCandidateDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
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
