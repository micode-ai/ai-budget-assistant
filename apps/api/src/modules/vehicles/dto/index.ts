import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const FUEL_TYPES = ['petrol', 'diesel', 'lpg', 'electric', 'hybrid', 'other'] as const;

export class CreateVehicleDto {
  @IsString()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: string;
}

export class UpsertFuelLogDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  liters: number;

  @IsInt()
  @Min(0)
  odometerKm: number;

  @IsOptional()
  @IsBoolean()
  isFullTank?: boolean;
}
