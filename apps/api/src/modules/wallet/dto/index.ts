import { IsString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateWalletAdjustmentDto {
  @IsString()
  currencyCode: string;

  /** The balance the user really has; the server computes the difference. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1_000_000_000)
  actualBalance: number;
}

export class SetWalletBalanceDto {
  @IsOptional()
  @IsUUID()
  localId?: string;

  @IsString()
  currencyCode: string;

  @IsNumber()
  @Min(0)
  initialAmount: number;
}
