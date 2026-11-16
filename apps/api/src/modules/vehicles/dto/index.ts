import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VEHICLE_COST_KINDS } from '../vehicle-cost-rules.util';

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

/** Move a vehicle to another account the caller can edit (ABA-801). */
export class MoveVehicleDto {
  @IsString()
  @IsNotEmpty()
  targetAccountId: string;
}

/** A non-fuel cost on one expense (ABA-803). */
export class SetVehicleCostDto {
  @IsIn(VEHICLE_COST_KINDS)
  kind: string;
}

export class VehicleCategoryRuleDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsIn(VEHICLE_COST_KINDS)
  kind: string;
}

/** The vehicle's category rules: categories (PK or clientId) whose expenses are its costs (ABA-803). */
export class SetVehicleCategoryRulesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => VehicleCategoryRuleDto)
  rules: VehicleCategoryRuleDto[];
}

/** Many expenses as one kind of cost of a vehicle, from the transactions list (ABA-805). */
export class BulkVehicleCostDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  expenseIds: string[];

  @IsIn(VEHICLE_COST_KINDS)
  kind: string;
}
