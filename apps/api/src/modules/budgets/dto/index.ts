import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsArray,
  IsIn,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class BudgetCategoryAllocationDto {
  @IsString()
  categoryId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateBudgetDto {
  @IsUUID()
  localId: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  currencyCode: string;

  @IsString()
  @IsIn(['daily', 'weekly', 'monthly', 'yearly', 'custom'])
  period: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  alertThreshold?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCategoryAllocationDto)
  categories?: BudgetCategoryAllocationDto[];
}

export class UpdateBudgetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly', 'yearly', 'custom'])
  period?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  alertThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCategoryAllocationDto)
  categories?: BudgetCategoryAllocationDto[];
}

export class BudgetFiltersDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;
}
