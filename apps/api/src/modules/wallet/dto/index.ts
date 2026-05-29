import { IsString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

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
