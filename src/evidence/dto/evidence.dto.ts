import { IsString, IsNumber, IsOptional, Min, Max, IsNotEmpty } from 'class-validator';

export class AttachEvidenceDto {
  @IsString()
  @IsNotEmpty()
  scoreId: string;

  @IsString()
  @IsNotEmpty()
  scoreType: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  scoreValue: number;

  @IsString()
  @IsNotEmpty()
  evidenceType: string;

  @IsString()
  @IsNotEmpty()
  evidenceSource: string;

  @IsString()
  @IsNotEmpty()
  evidenceId: string;

  @IsString()
  @IsOptional()
  transcriptSnippet?: string;

  @IsNumber()
  @IsOptional()
  timestampStart?: number;

  @IsNumber()
  @IsOptional()
  timestampEnd?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  confidence?: number;
}
