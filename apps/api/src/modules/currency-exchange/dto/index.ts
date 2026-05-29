import { IsString, IsNumber, IsOptional, IsUUID, IsDateString, Min } from 'class-validator';

export class CreateCurrencyExchangeDto {
  @IsUUID()
  localId: string;

  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsNumber()
  @Min(0)
  fromAmount: number;

  @IsNumber()
  @Min(0)
  toAmount: number;

  @IsNumber()
  @Min(0)
  exchangeRate: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  encryptedPayload?: string;

  @IsOptional()
  @IsNumber()
  encryptionKeyVersion?: number;
}

export class UpdateCurrencyExchangeDto {
  @IsOptional()
  @IsString()
  fromCurrency?: string;

  @IsOptional()
  @IsString()
  toCurrency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fromAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  toAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  encryptedPayload?: string;

  @IsOptional()
  @IsNumber()
  encryptionKeyVersion?: number;
}

export class CurrencyExchangeFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
