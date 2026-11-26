import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpsertCardCycleDto {
  @IsInt()
  @Min(1)
  @Max(31)
  statementDay: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  creditLimit?: number | null;

  @IsString()
  @Length(3, 3)
  currencyCode: string;
}
