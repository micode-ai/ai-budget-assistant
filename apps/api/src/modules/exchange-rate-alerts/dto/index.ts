import { IsString, IsNumber, IsIn, Min, Max } from 'class-validator';

export class CreateExchangeRateWatchDto {
  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsNumber()
  @Min(0.000001)
  @Max(999999) // column is Decimal(12,6) — keep well under its overflow point
  targetRate: number;

  @IsIn(['above', 'below'])
  direction: 'above' | 'below';
}
