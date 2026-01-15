import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { ClientType, ClientStatus } from '@prisma/client';

export class CreateClientDto {
  @IsEnum(ClientType)
  @IsNotEmpty()
  type: ClientType;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsEnum(ClientStatus)
  @IsOptional()
  status?: ClientStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  // Company-specific fields
  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  companyRegistrationNumber?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  taxId?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  vatNumber?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  industry?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  companySize?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  website?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  contactPersonFirstName?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  contactPersonLastName?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsEmail()
  @IsOptional()
  contactPersonEmail?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  contactPersonPhone?: string;

  @ValidateIf((o) => o.type === ClientType.company)
  @IsString()
  @IsOptional()
  contactPersonTitle?: string;

  // Individual-specific fields
  @ValidateIf((o) => o.type === ClientType.individual)
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ValidateIf((o) => o.type === ClientType.individual)
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ValidateIf((o) => o.type === ClientType.individual)
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ValidateIf((o) => o.type === ClientType.individual)
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ValidateIf((o) => o.type === ClientType.individual)
  @IsString()
  @IsOptional()
  passportNumber?: string;
}
