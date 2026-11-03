import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import {
  CURRENCY,
  EX,
  IsDateOnlyConstraint,
  MONEY,
  NotNullIfPresent,
  RawValue,
} from './public-expense.dto';

/**
 * Public budget shapes. Same conventions as the income DTOs (snake_case, decimal strings, shared
 * helpers imported from `public-expense.dto.ts`, never copied).
 */

export const EX_BUDGET_ID = '4c8e2a6f-1b3d-4f5a-9c7e-0a2b4d6f8e10';

export const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export const PUBLIC_BUDGET_NAME_MAX = 200;
export const PUBLIC_ALLOCATIONS_MAX = 100;

const DECIMAL = { type: String, pattern: '^\\d+(\\.\\d+)?$' } as const;
const ISO_TS = { type: String, format: 'date-time' } as const;

// ── writes ──────────────────────────────────────────────────────────────────

/** One category allocation of a budget. */
export class PublicBudgetAllocationInput {
  /** One of the account's live expense categories (`GET /categories?type=expense`). */
  @ApiProperty({ type: String, format: 'uuid', example: EX.categoryId })
  @IsUUID('all')
  category_id!: string;

  /** Decimal string, at most two decimal places, e.g. `"300.00"`. */
  @ApiProperty({ type: String, pattern: MONEY.source, example: '300.00' })
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string with at most 2 decimal places' })
  amount!: string;
}

/**
 * `POST /public/v1/budgets`. A budget has no category of its own: category scope exists only
 * through `allocations`. The source/creator are not writable (the global pipe refuses unknown fields).
 */
export class PublicBudgetCreateDto {
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: PUBLIC_BUDGET_NAME_MAX,
    example: 'Groceries',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(PUBLIC_BUDGET_NAME_MAX)
  name!: string;

  /** Decimal string, at most two decimal places, e.g. `"1500.00"`. */
  @ApiProperty({ type: String, pattern: MONEY.source, example: '1500.00' })
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string with at most 2 decimal places' })
  amount!: string;

  /** ISO 4217, upper case. Default: the account's base currency. */
  @ApiPropertyOptional({ type: String, pattern: CURRENCY.source, example: 'PLN' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a three-letter ISO 4217 code in upper case' })
  currency?: string;

  @ApiProperty({ type: String, enum: BUDGET_PERIODS, example: 'monthly' })
  @IsIn(BUDGET_PERIODS)
  period!: string;

  /** `YYYY-MM-DD` */
  @ApiProperty({ type: String, format: 'date', example: '2026-11-01' })
  @Validate(IsDateOnlyConstraint)
  start_date!: string;

  /** `YYYY-MM-DD`; meaningful for `custom` budgets. */
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-11-30' })
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  end_date?: string;

  /** Percent of the amount at which the app warns, 1–100. Default 80. */
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, example: 80 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  alert_threshold?: number;

  @ApiPropertyOptional({
    type: () => [PublicBudgetAllocationInput],
    maxItems: PUBLIC_ALLOCATIONS_MAX,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PUBLIC_ALLOCATIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => PublicBudgetAllocationInput)
  allocations?: PublicBudgetAllocationInput[];
}

/**
 * `PATCH /public/v1/budgets/{id}` — every field optional; an absent field is left unchanged and
 * `null` is refused everywhere. `allocations` REPLACES the whole set (`[]` clears it); absent keeps it.
 */
export class PublicBudgetUpdateDto {
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: PUBLIC_BUDGET_NAME_MAX,
    example: 'Food',
  })
  @NotNullIfPresent()
  @IsString()
  @MinLength(1)
  @MaxLength(PUBLIC_BUDGET_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ type: String, pattern: MONEY.source, example: '1600.00' })
  @NotNullIfPresent()
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string with at most 2 decimal places' })
  amount?: string;

  @ApiPropertyOptional({ type: String, pattern: CURRENCY.source, example: 'EUR' })
  @NotNullIfPresent()
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a three-letter ISO 4217 code in upper case' })
  currency?: string;

  @ApiPropertyOptional({ type: String, enum: BUDGET_PERIODS, example: 'weekly' })
  @NotNullIfPresent()
  @IsIn(BUDGET_PERIODS)
  period?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-11-01' })
  @NotNullIfPresent()
  @Validate(IsDateOnlyConstraint)
  start_date?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-12-31' })
  @NotNullIfPresent()
  @Validate(IsDateOnlyConstraint)
  end_date?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, example: 90 })
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(100)
  alert_threshold?: number;

  @ApiPropertyOptional({
    type: () => [PublicBudgetAllocationInput],
    maxItems: PUBLIC_ALLOCATIONS_MAX,
  })
  @NotNullIfPresent()
  @IsArray()
  @ArrayMaxSize(PUBLIC_ALLOCATIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => PublicBudgetAllocationInput)
  allocations?: PublicBudgetAllocationInput[];
}

// ── responses ───────────────────────────────────────────────────────────────

export class PublicBudgetAllocation {
  @ApiProperty({ type: String, format: 'uuid', example: EX.categoryId })
  category_id!: string;
  /** `null` at encryption tier 1 (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'Food' })
  category_name!: string | null;
  /** Decimal string in the budget's currency. */
  @ApiProperty({ ...DECIMAL, example: '300.00' })
  amount!: string;
}

/** Spend against the budget for the CURRENT period, in the budget's own currency (never converted). */
export class PublicBudgetProgress {
  /** `YYYY-MM-DD`; the account's financial-month anchor applies to monthly budgets. */
  @ApiProperty({ type: String, format: 'date', example: '2026-11-01' })
  period_start!: string;
  /** `YYYY-MM-DD`, inclusive. */
  @ApiProperty({ type: String, format: 'date', example: '2026-11-30' })
  period_end!: string;
  @ApiProperty({ ...DECIMAL, example: '412.30' })
  spent!: string;
  /** Never negative: an overspent budget reports `"0.00"`. */
  @ApiProperty({ ...DECIMAL, example: '1087.70' })
  remaining!: string;
  /** Percent of the amount spent, one decimal place; may exceed 100. */
  @ApiProperty({ type: Number, example: 27.5 })
  percent_used!: number;
  /** End-of-period estimate; equals `spent` when too little of the period has elapsed to project. */
  @ApiProperty({ ...DECIMAL, example: '1200.00' })
  projected_total!: string;
}

export class PublicBudget {
  @ApiProperty({ type: String, format: 'uuid', example: EX_BUDGET_ID })
  id!: string;
  /** `null` at encryption tier 1 (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'Groceries' })
  name!: string | null;
  @ApiProperty({ ...DECIMAL, example: '1500.00' })
  amount!: string;
  @ApiProperty({ type: String, example: 'PLN' })
  currency!: string;
  @ApiProperty({ type: String, enum: BUDGET_PERIODS, example: 'monthly' })
  period!: string;
  @ApiProperty({ type: String, format: 'date', example: '2026-11-01' })
  start_date!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true, example: null })
  end_date!: string | null;
  @ApiProperty({ type: 'integer', example: 80 })
  alert_threshold!: number;
  @ApiProperty({ type: Boolean, example: true })
  is_active!: boolean;
  /** Empty = the budget covers all spending in its currency. */
  @ApiProperty({ type: () => [PublicBudgetAllocation] })
  allocations!: PublicBudgetAllocation[];
  @ApiProperty({ type: () => PublicBudgetProgress })
  progress!: PublicBudgetProgress;
  /** Public names of the fields withheld because the account is end-to-end encrypted (tier 1). */
  @ApiProperty({ type: [String], example: [] })
  encrypted_fields!: string[];
  /** ISO-8601 UTC */
  @ApiProperty({ ...ISO_TS, example: '2026-11-01T09:00:00.000Z' })
  created_at!: string;
  /** ISO-8601 UTC */
  @ApiProperty({ ...ISO_TS, example: '2026-11-01T09:00:00.000Z' })
  updated_at!: string;
}

export class PublicBudgetList {
  @ApiProperty({ type: () => [PublicBudget] })
  data!: PublicBudget[];
}
