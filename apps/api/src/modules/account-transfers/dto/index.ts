import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateAccountTransferDto {
  @IsUUID()
  localId: string;

  @IsUUID()
  fromAccountId: string;

  @IsString()
  fromCurrency: string;

  @IsNumber()
  @Min(0)
  fromAmount: number;

  @IsUUID()
  toAccountId: string;

  @IsString()
  toCurrency: string;

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
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  countAsIncome?: boolean;
}

export class UpdateAccountTransferDto {
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
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  countAsIncome?: boolean;
}
