import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
  IsPositive,
  Max,
} from 'class-validator';

export class CreatePortfolioHoldingDto {
  @IsString()
  @IsUUID()
  localId: string;

  @IsString()
  assetSymbol: string;

  @IsString()
  assetName: string;

  @IsEnum(['stock', 'crypto', 'etf', 'bond', 'commodity'])
  assetType: 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity';

  @IsOptional()
  @IsString()
  assetExchange?: string;

  @IsOptional()
  @IsString()
  assetCurrency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateInvestmentTransactionDto {
  @IsString()
  @IsUUID()
  localId: string;

  @IsString()
  @IsUUID()
  holdingId: string;

  @IsEnum(['buy', 'sell'])
  type: 'buy' | 'sell';

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  pricePerUnit: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  @Max(500)
  notes?: string;
}

export class UpdateInvestmentTransactionDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PortfolioAnalyticsRequestDto {
  @IsEnum(['week', 'month', 'quarter', 'year', 'all'])
  period: 'week' | 'month' | 'quarter' | 'year' | 'all';

  @IsOptional()
  @IsString()
  benchmark?: string;
}
