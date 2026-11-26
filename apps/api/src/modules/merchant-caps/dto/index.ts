import { IsNumber, IsString, Length, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertMerchantCapDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  merchant: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount: number;

  @IsString()
  @Length(3, 3)
  currencyCode: string;
}
