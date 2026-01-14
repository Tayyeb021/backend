import { IsString, IsNotEmpty, IsUUID, IsEnum } from 'class-validator';

export enum SourcePlatform {
  LINKEDIN = 'linkedin',
  BAYT = 'bayt',
  NAUKRI_GULF = 'naukri_gulf',
}

export class SourceCandidateDto {
  @IsString()
  @IsNotEmpty()
  profileUrl: string;

  @IsUUID()
  @IsNotEmpty()
  jobId: string;

  @IsEnum(SourcePlatform)
  platform: SourcePlatform;
}
