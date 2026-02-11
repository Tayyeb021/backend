import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RequestFeedbackDto {
  @IsString()
  @IsNotEmpty()
  candidateId: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  interviewId?: string;

  @IsString()
  @IsOptional()
  message?: string;
}
