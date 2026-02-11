import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TestCaseInputDto {
  @IsString()
  input: string;

  @IsString()
  expected: string;

  @IsString()
  name: string;
}

export class RunCodeDto {
  @IsString()
  code: string;

  @IsString()
  language: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseInputDto)
  testCases: TestCaseInputDto[];
}
