import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const UTILITY_KINDS = ['electricity', 'gas', 'water', 'heating'] as const;
export const UTILITY_UNITS = ['kwh', 'm3', 'gj'] as const;

export class UpsertUtilityReadingDto {
  @IsIn(UTILITY_KINDS)
  kind: (typeof UTILITY_KINDS)[number];

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  consumption: number;

  @IsIn(UTILITY_UNITS)
  unit: (typeof UTILITY_UNITS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  propertyLabel?: string | null;
}
