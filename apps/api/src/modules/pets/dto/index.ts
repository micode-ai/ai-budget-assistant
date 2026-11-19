import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PET_COST_KINDS, PET_SPECIES } from '../pet-history.util';

/** One category rule: an expense category (PK or a device's clientId) whose expenses are this pet's cost (ABA-833). */
export class PetCategoryRuleDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsIn(PET_COST_KINDS)
  kind: string;
}

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

  /** `YYYY-MM-DD`; the reminder cron pushes 14 and 2 days before (ABA-831). */
  @IsOptional()
  @IsDateString()
  nextVaccinationDate?: string;

  @IsOptional()
  @IsDateString()
  nextParasiteTreatmentDate?: string;

  /** Replaces the pet's category rules and applies them at once (ABA-833); live expense categories of the account only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PetCategoryRuleDto)
  categoryRules?: PetCategoryRuleDto[];
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

  /** Replaces the pet's category rules and applies them at once (ABA-833); live expense categories of the account only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PetCategoryRuleDto)
  categoryRules?: PetCategoryRuleDto[];
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
