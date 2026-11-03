import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, Validate } from 'class-validator';
import { CURRENCY, EX, IsDateOnlyConstraint } from './public-expense.dto';

/**
 * Public analytics shapes. Same conventions as the other public DTOs: snake_case, money as decimal
 * strings with two places, dates `YYYY-MM-DD`, shared helpers imported from `public-expense.dto.ts`.
 * Format errors in the query answer `400 validation_failed` through the global pipe; the range and
 * currency rules that need more than one field live in `PublicAnalyticsService`, also `400`.
 */

export const ANALYTICS_TYPES = ['expense', 'income'] as const;
export type PublicAnalyticsType = (typeof ANALYTICS_TYPES)[number];

/** Longest range of `summary` and `by-category`, in days (both ends inclusive): a leap year. */
export const ANALYTICS_MAX_DAYS = 366;
/** Longest range of `monthly`, in calendar months touched by the range. */
export const ANALYTICS_MAX_MONTHS = 24;

const SIGNED_DECIMAL = { type: String, pattern: '^-?\\d+\\.\\d{2}$' } as const;
const DECIMAL = { type: String, pattern: '^\\d+\\.\\d{2}$' } as const;

// ── query ───────────────────────────────────────────────────────────────────

/** `GET /public/v1/analytics/summary|monthly` query. */
export class PublicAnalyticsQueryDto {
  /** Inclusive, `YYYY-MM-DD`. */
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  @Validate(IsDateOnlyConstraint)
  from!: string;

  /** Inclusive, `YYYY-MM-DD`. */
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  @Validate(IsDateOnlyConstraint)
  to!: string;

  /** ISO 4217; default: the display currency of the user who connected the app. */
  @ApiPropertyOptional({ type: String, pattern: CURRENCY.source, example: 'PLN' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a three-letter ISO 4217 code in upper case' })
  currency?: string;
}

/** `GET /public/v1/analytics/by-category` query. */
export class PublicAnalyticsByCategoryQueryDto extends PublicAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ANALYTICS_TYPES, default: 'expense', example: 'expense' })
  @IsOptional()
  @IsIn(ANALYTICS_TYPES)
  type?: PublicAnalyticsType;
}

// ── responses ───────────────────────────────────────────────────────────────

/** The fields every analytics response carries. Not published on its own. */
abstract class PublicAnalyticsEnvelope {
  @ApiProperty({ type: String, example: 'PLN' })
  currency!: string;
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  from!: string;
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  to!: string;
  /** At least one counted amount was converted from another currency. */
  @ApiProperty({ type: Boolean, example: true })
  fx_converted!: boolean;
  /** At least one amount was left out because no exchange rate was known for its currency. */
  @ApiProperty({ type: Boolean, example: false })
  fx_approximate!: boolean;
  @ApiProperty({ type: [String], example: [] })
  encrypted_fields!: string[];
}

export class PublicAnalyticsSummary extends PublicAnalyticsEnvelope {
  @ApiProperty({ ...DECIMAL, example: '8200.00' })
  total_income!: string;
  @ApiProperty({ ...DECIMAL, example: '5310.45' })
  total_expenses!: string;
  /** `total_income - total_expenses`; may be negative. */
  @ApiProperty({ ...SIGNED_DECIMAL, example: '2889.55' })
  net!: string;
  /** Expense and income rows counted in the totals. */
  @ApiProperty({ type: 'integer', example: 87 })
  transaction_count!: number;
}

export class PublicAnalyticsCategoryAmount {
  /** `null` for rows without a category. */
  @ApiProperty({ type: String, format: 'uuid', nullable: true, example: EX.categoryId })
  category_id!: string | null;
  /** `null` without a category, and at encryption tier 1 (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'Food' })
  category_name!: string | null;
  @ApiProperty({ ...DECIMAL, example: '1240.30' })
  amount!: string;
  /** `amount` / the sum of all rows, 4 decimal places. */
  @ApiProperty({ type: Number, example: 0.2336 })
  share!: number;
}

export class PublicAnalyticsByCategory extends PublicAnalyticsEnvelope {
  @ApiProperty({ type: () => [PublicAnalyticsCategoryAmount] })
  data!: PublicAnalyticsCategoryAmount[];
}

export class PublicAnalyticsMonth {
  /** `YYYY-MM`, a calendar month. */
  @ApiProperty({ type: String, pattern: '^\\d{4}-\\d{2}$', example: '2026-10' })
  month!: string;
  @ApiProperty({ ...DECIMAL, example: '8200.00' })
  income!: string;
  @ApiProperty({ ...DECIMAL, example: '5310.45' })
  expenses!: string;
  @ApiProperty({ ...SIGNED_DECIMAL, example: '2889.55' })
  net!: string;
}

export class PublicAnalyticsMonthly extends PublicAnalyticsEnvelope {
  @ApiProperty({ type: () => [PublicAnalyticsMonth] })
  data!: PublicAnalyticsMonth[];
}
