import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateIncomeDto {
  @IsUUID()
  localId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  currencyCode: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  isDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isDebtRepayment?: boolean;

  @IsOptional()
  @IsString()
  debtContactName?: string;

  @IsOptional()
  @IsDateString()
  debtDueDate?: string;

  @IsOptional()
  @IsUUID()
  relatedDebtExpenseId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  encryptedPayload?: string;

  @IsOptional()
  @IsNumber()
  encryptionKeyVersion?: number;
}

export class UpdateIncomeDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isDebtRepayment?: boolean;

  @IsOptional()
  @IsString()
  debtContactName?: string;

  @IsOptional()
  @IsDateString()
  debtDueDate?: string;

  @IsOptional()
  @IsUUID()
  relatedDebtExpenseId?: string;

  @IsOptional()
  @IsString()
  encryptedPayload?: string;

  @IsOptional()
  @IsNumber()
  encryptionKeyVersion?: number;
}

export class IncomeFiltersDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(10000)
  limit?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isDebt?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isDebtRepayment?: boolean;
}

/**
 * PATCH /incomes/bulk — mirrors BulkUpdateExpensesDto, minus tagIds/isDeleted
 * (no tag junction table on the income side in v1; out of scope for this
 * feature, see docs/contracts/categorize-uncategorized-incomes.md).
 */
export class BulkUpdateIncomesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  ids: string[];

  @IsOptional()
  @IsString()
  categoryId?: string | null;
}
