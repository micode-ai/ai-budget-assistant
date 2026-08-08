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
  // Re-homing a transfer. Currencies travel with the accounts: keeping the old
  // currency after moving a transfer to an account denominated in another one
  // would store a row that means nothing.
  @IsOptional()
  @IsUUID()
  fromAccountId?: string;

  @IsOptional()
  @IsUUID()
  toAccountId?: string;

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
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  countAsIncome?: boolean;
}
