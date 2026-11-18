import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PET_COST_KINDS, PET_SPECIES } from '../pet-history.util';

export class CreatePetDto {
  @IsString()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsIn(PET_SPECIES)
  species?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string;
}

export class UpdatePetDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(PET_SPECIES)
  species?: string;

  /** `YYYY-MM-DD`, or null to clear. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  birthday?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  nextVaccinationDate?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  nextParasiteTreatmentDate?: string | null;
}

export class SetPetCostDto {
  @IsIn(PET_COST_KINDS)
  kind: string;
}

/** Many expenses as one kind of cost of a pet, from the transactions list. */
export class BulkPetCostDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  expenseIds: string[];

  @IsIn(PET_COST_KINDS)
  kind: string;
}
