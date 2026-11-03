import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  CURRENCY,
  EX,
  IsDateOnlyConstraint,
  IsPositiveDecimalConstraint,
  MONEY,
  NotNullIfPresent,
  PUBLIC_DESCRIPTION_MAX,
  PUBLIC_NOTES_MAX,
  PUBLIC_TAGS_MAX,
  RawValue,
  PUBLIC_CHANGES_DEFAULT_LIMIT,
  PUBLIC_CHANGES_MAX_LIMIT,
  PUBLIC_EXPENSES_DEFAULT_LIMIT,
  PUBLIC_EXPENSES_MAX_LIMIT,
  PublicCreatedByApp,
  PublicRef,
} from './public-expense.dto';

/**
 * Public income shapes. Mirrors `public-expense.dto.ts` (same naming, snake_case, decimal strings);
 * the shared helpers and the reusable classes (`PublicRef`, `PublicCreatedByApp`) are imported from
 * there, never copied.
 */

export const EX_INCOME_ID = '6b1f4a7c-2e9d-4c3a-8f5b-0d7e9a1c3b25';

const ISO_TS = { type: String, format: 'date-time' } as const;
const DECIMAL = { type: String, pattern: '^\\d+(\\.\\d+)?$' } as const;

// ── query ───────────────────────────────────────────────────────────────────

/** `date_to` must not precede `date_from` (both are already checked as dates by their own validators). */
@ValidatorConstraint({ name: 'isNotBeforeFrom', async: false })
export class IsNotBeforeFromConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    const from = (args?.object as { date_from?: unknown } | undefined)?.date_from;
    if (typeof value !== 'string' || typeof from !== 'string') return true;
    return value >= from; // YYYY-MM-DD sorts lexicographically
  }
  defaultMessage(): string {
    return 'date_to must not be earlier than date_from';
  }
}

/** `GET /public/v1/incomes` query. Unknown params are refused by the global pipe (`validation_failed`). */
export class ListPublicIncomesQueryDto {
  /** Inclusive, `YYYY-MM-DD`. */
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-01' })
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  date_from?: string;

  /** Inclusive, `YYYY-MM-DD`; not earlier than `date_from`. */
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-31' })
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  @Validate(IsNotBeforeFromConstraint)
  date_to?: string;

  /** The income's category. */
  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.projectId })
  @IsOptional()
  @IsUUID('all')
  project_id?: string;

  /** Case-insensitive "contains" on the description or the notes. */
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 200, example: 'salary' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  search?: string;

  /** 1–200, default 50. */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PUBLIC_EXPENSES_MAX_LIMIT,
    default: PUBLIC_EXPENSES_DEFAULT_LIMIT,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLIC_EXPENSES_MAX_LIMIT)
  limit?: number;

  /** `next_cursor` of the previous page, unchanged. */
  @ApiPropertyOptional({ type: String, maxLength: 1024, example: EX.cursor })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;
}

/** `GET /public/v1/incomes/changes` query. */
export class ListPublicIncomeChangesQueryDto {
  /** 1–200, default 200. */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PUBLIC_CHANGES_MAX_LIMIT,
    default: PUBLIC_CHANGES_DEFAULT_LIMIT,
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLIC_CHANGES_MAX_LIMIT)
  limit?: number;

  /** `next_cursor` of the previous page, unchanged; omitted = from the beginning. */
  @ApiPropertyOptional({ type: String, maxLength: 1024, example: EX.cursor })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;
}

// ── writes ──────────────────────────────────────────────────────────────────

/**
 * `POST /public/v1/incomes`. No `is_debt*` and no `source`: debt fields are not writable through
 * this API, and the source is always `api` (the global pipe refuses unknown fields).
 */
export class PublicIncomeCreateDto {
  /** Decimal string, > 0, at most two decimal places, e.g. `"4200.00"`. */
  @ApiProperty({ type: String, pattern: MONEY.source, example: '4200.00' })
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string with at most 2 decimal places' })
  @Validate(IsPositiveDecimalConstraint)
  amount!: string;

  /** ISO 4217, upper case. Default: the account's base currency. */
  @ApiPropertyOptional({ type: String, pattern: CURRENCY.source, example: 'PLN' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a three-letter ISO 4217 code in upper case' })
  currency?: string;

  /** `YYYY-MM-DD` */
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  @Validate(IsDateOnlyConstraint)
  date!: string;

  /** One of the account's live income categories (`GET /categories?type=income`). */
  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string;

  @ApiPropertyOptional({ type: String, maxLength: PUBLIC_DESCRIPTION_MAX, example: 'October salary' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ type: String, maxLength: PUBLIC_NOTES_MAX, example: 'Including the quarterly bonus' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_NOTES_MAX)
  notes?: string;

  /** The account's live tags. */
  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: PUBLIC_TAGS_MAX, uniqueItems: true, example: [EX.tagId] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PUBLIC_TAGS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tag_ids?: string[];

  /** One of the account's live projects. */
  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.projectId })
  @IsOptional()
  @IsUUID('all')
  project_id?: string;
}

/**
 * `PATCH /public/v1/incomes/{id}` — every field optional; an absent field is left unchanged.
 * `null` clears `description`, `notes`, `category_id` and `project_id`; `tag_ids: []` removes every
 * tag. `amount`, `currency`, `date` and `tag_ids` cannot be `null`. Debt fields, `source` and the
 * creator are not writable.
 */
export class PublicIncomeUpdateDto {
  @ApiPropertyOptional({ type: String, pattern: MONEY.source, example: '4300.00' })
  @NotNullIfPresent()
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'amount must be a decimal string with at most 2 decimal places' })
  @Validate(IsPositiveDecimalConstraint)
  amount?: string;

  @ApiPropertyOptional({ type: String, pattern: CURRENCY.source, example: 'EUR' })
  @NotNullIfPresent()
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a three-letter ISO 4217 code in upper case' })
  currency?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-30' })
  @NotNullIfPresent()
  @Validate(IsDateOnlyConstraint)
  date?: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_DESCRIPTION_MAX, example: 'Salary' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_NOTES_MAX, example: null })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_NOTES_MAX)
  notes?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: PUBLIC_TAGS_MAX, uniqueItems: true, example: [] })
  @NotNullIfPresent()
  @IsArray()
  @ArrayMaxSize(PUBLIC_TAGS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tag_ids?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', example: null })
  @IsOptional()
  @IsUUID('all')
  project_id?: string | null;
}

// ── responses ───────────────────────────────────────────────────────────────

export class PublicIncome {
  @ApiProperty({ type: String, format: 'uuid', example: EX_INCOME_ID })
  id!: string;
  /** Decimal string in the income's own currency, never converted. */
  @ApiProperty({ ...DECIMAL, example: '4200.00' })
  amount!: string;
  @ApiProperty({ type: String, example: 'PLN' })
  currency!: string;
  /** `YYYY-MM-DD` */
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  date!: string;
  /** `null` at encryption tier 1 (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'October salary' })
  description!: string | null;
  /** `null` at encryption tier 1 (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: null })
  notes!: string | null;
  /** `name` is `null` at encryption tier 1. */
  @ApiProperty({ type: () => PublicRef, nullable: true })
  category!: PublicRef | null;
  @ApiProperty({ type: () => [PublicRef] })
  tags!: PublicRef[];
  @ApiProperty({ type: () => PublicRef, nullable: true })
  project!: PublicRef | null;
  @ApiProperty({ type: String, example: 'api' })
  source!: string;
  @ApiProperty({ type: Boolean, example: false })
  is_debt!: boolean;
  @ApiProperty({ type: Boolean, example: false })
  is_debt_repayment!: boolean;
  @ApiProperty({ type: Boolean, example: false })
  is_split_receivable!: boolean;
  /** True for the income leg of a transfer between two of the user's accounts. */
  @ApiProperty({ type: Boolean, example: false })
  is_transfer!: boolean;
  @ApiProperty({ type: () => PublicCreatedByApp, nullable: true })
  created_by_app!: PublicCreatedByApp | null;
  /** Public names of the fields withheld because the account is end-to-end encrypted (tier 1). */
  @ApiProperty({ type: [String], example: [] })
  encrypted_fields!: string[];
  /** ISO-8601 UTC */
  @ApiProperty({ ...ISO_TS, example: '2026-10-31T17:46:02.114Z' })
  created_at!: string;
  /** ISO-8601 UTC */
  @ApiProperty({ ...ISO_TS, example: '2026-10-31T17:46:02.114Z' })
  updated_at!: string;
}

export class PublicIncomeList {
  @ApiProperty({ type: () => [PublicIncome] })
  data!: PublicIncome[];
  @ApiProperty({ type: String, nullable: true, example: EX.cursor })
  next_cursor!: string | null;
  @ApiProperty({ type: Boolean, example: true })
  has_more!: boolean;
}

export class PublicIncomeUpsertChange {
  @ApiProperty({ type: String, enum: ['upsert'], example: 'upsert' })
  type!: 'upsert';
  @ApiProperty({ type: () => PublicIncome })
  income!: PublicIncome;
}

export class PublicIncomeDeleteChange {
  @ApiProperty({ type: String, enum: ['delete'], example: 'delete' })
  type!: 'delete';
  @ApiProperty({ type: String, format: 'uuid', example: EX_INCOME_ID })
  id!: string;
  /** ISO-8601 UTC — when the income was deleted. */
  @ApiProperty({ ...ISO_TS, example: '2026-10-31T18:02:40.517Z' })
  deleted_at!: string;
}

@ApiExtraModels(PublicIncomeUpsertChange, PublicIncomeDeleteChange)
export class PublicIncomeChanges {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(PublicIncomeUpsertChange) },
        { $ref: getSchemaPath(PublicIncomeDeleteChange) },
      ],
      discriminator: {
        propertyName: 'type',
        mapping: {
          upsert: getSchemaPath(PublicIncomeUpsertChange),
          delete: getSchemaPath(PublicIncomeDeleteChange),
        },
      },
    },
  })
  changes!: Array<PublicIncomeUpsertChange | PublicIncomeDeleteChange>;
  /** Always present — on an empty page it equals the cursor sent. Store it and send it next time. */
  @ApiProperty({ type: String, example: EX.cursor })
  next_cursor!: string;
  @ApiProperty({ type: Boolean, example: false })
  has_more!: boolean;
}
