import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Public `/public/v1` request and response shapes. These are deliberately separate from the
 * internal `modules/expenses/dto` classes, so the app's DTOs can change without breaking
 * integrators (spec section 5). JSON is snake_case; amounts are decimal strings.
 *
 * The `@ApiProperty` decorators carry structure only (type, nullability, limits, example) for the
 * published OpenAPI document. Every human-readable description comes from `docs/texts.<lang>.ts`,
 * keyed by schema and field, so the three languages cannot drift structurally (`docs/texts.spec.ts`).
 */

/** Example values shared by the OpenAPI examples. */
export const EX = {
  expenseId: '3f2b8c1e-7d4a-4f6b-9c2e-1a5d8e9f0b37',
  categoryId: '8a6e0f52-1c3b-4d7e-a9f8-2b4c6d8e0f13',
  tagId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  projectId: '5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170',
  itemId: '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  userId: '2d4f6a8c-0e1b-4c3d-9e5f-7a9b1c3d5e7f',
  accountId: '7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a',
  clientId: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
  cursor: 'eyJ1IjoiMjAyNi0xMC0zMVQxMjozNDo1Ni43ODlaIiwiaSI6IjNmMmI4YzFlIn0',
} as const;

// ── shared helpers ──────────────────────────────────────────────────────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date written `YYYY-MM-DD` (rejects `2026-02-30`, datetimes, other formats). */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

@ValidatorConstraint({ name: 'isDateOnly', async: false })
export class IsDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isDateOnly(value);
  }
  defaultMessage(args?: ValidationArguments): string {
    return `${args?.property ?? 'value'} must be a date in YYYY-MM-DD format`;
  }
}

// ── query ───────────────────────────────────────────────────────────────────

export const PUBLIC_EXPENSES_DEFAULT_LIMIT = 50;
export const PUBLIC_EXPENSES_MAX_LIMIT = 200;

/** `GET /public/v1/categories` query. */
export class ListPublicCategoriesQueryDto {
  /** Which categories to list; default `expense`. */
  @ApiPropertyOptional({ enum: ['expense', 'income'], default: 'expense', example: 'income' })
  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: 'expense' | 'income';
}

/** `GET /public/v1/expenses` query. Unknown params are refused by the global pipe (`validation_failed`). */
export class ListPublicExpensesQueryDto {
  /** Inclusive, `YYYY-MM-DD`. */
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-01' })
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  date_from?: string;

  /** Inclusive, `YYYY-MM-DD`. */
  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-31' })
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  date_to?: string;

  /** The expense's own category (`category_id`); category splits are not searched. */
  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string;

  /** Case-insensitive "contains" on the merchant. */
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 200, example: 'Biedronka' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  merchant?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.projectId })
  @IsOptional()
  @IsUUID('all')
  project_id?: string;

  /** Case-insensitive "contains" on the description or the notes (the same fields the app's own search covers). */
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 200, example: 'coffee' })
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

export const PUBLIC_CHANGES_DEFAULT_LIMIT = 200;
export const PUBLIC_CHANGES_MAX_LIMIT = 200;

/** `GET /public/v1/expenses/changes` query. */
export class ListPublicExpenseChangesQueryDto {
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

// ── write bodies ────────────────────────────────────────────────────────────

/**
 * Money: a decimal string, at most two decimal places and ten integer digits — the
 * `Decimal(12, 2)` columns the values land in. `> 0` is checked separately where it applies.
 */
export const MONEY = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
/** Quantity: `Decimal(10, 3)` — at most three decimal places and seven integer digits. */
const QUANTITY = /^(0|[1-9]\d{0,6})(\.\d{1,3})?$/;
export const CURRENCY = /^[A-Z]{3}$/;
const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PUBLIC_DESCRIPTION_MAX = 500;
export const PUBLIC_NOTES_MAX = 2000;
/** Same cap as the app's own `CreateExpenseDto.merchant`. */
export const PUBLIC_MERCHANT_MAX = 120;
export const PUBLIC_LOCATION_NAME_MAX = 200;
export const PUBLIC_TAGS_MAX = 50;
export const PUBLIC_ITEMS_MAX = 500;

/**
 * Amounts are decimal STRINGS. The global pipe runs with `enableImplicitConversion`, which would
 * quietly turn a JSON number into a string and accept it; this keeps the raw JSON value so a
 * number fails `IsString` instead of being accepted after a float round-trip.
 */
export const RawValue = () => Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]);

@ValidatorConstraint({ name: 'isPositiveDecimal', async: false })
export class IsPositiveDecimalConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && Number(value) > 0;
  }
  defaultMessage(args?: ValidationArguments): string {
    return `${args?.property ?? 'value'} must be greater than 0`;
  }
}

/** `undefined` skips validation; `null` is validated (and refused) — for fields that cannot be cleared. */
export const NotNullIfPresent = () => ValidateIf((_o, v) => v !== undefined);

export class PublicLocationInput {
  @ApiProperty({ type: Number, minimum: -90, maximum: 90, example: 52.2297 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ type: Number, minimum: -180, maximum: 180, example: 21.0122 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_LOCATION_NAME_MAX, example: 'Marszałkowska 10, Warszawa' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_LOCATION_NAME_MAX)
  name?: string | null;
}

export class PublicExpenseItemInput {
  @ApiProperty({ type: String, minLength: 1, maxLength: PUBLIC_DESCRIPTION_MAX, example: 'Milk 2% 1 l' })
  @IsString()
  @MinLength(1)
  @MaxLength(PUBLIC_DESCRIPTION_MAX)
  description!: string;

  /** Decimal string, up to three places, > 0. Default `"1"`. */
  @ApiPropertyOptional({ type: String, pattern: QUANTITY.source, default: '1', example: '2' })
  @IsOptional()
  @RawValue()
  @IsString()
  @Matches(QUANTITY, { message: 'quantity must be a decimal string with at most 3 decimal places' })
  @Validate(IsPositiveDecimalConstraint)
  quantity?: string;

  /** Decimal string, up to two places, >= 0. Default `"0"`. */
  @ApiPropertyOptional({ type: String, pattern: MONEY.source, default: '0', example: '3.49' })
  @IsOptional()
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'unit_price must be a decimal string with at most 2 decimal places' })
  unit_price?: string;

  /** Decimal string, up to two places, >= 0. */
  @ApiProperty({ type: String, pattern: MONEY.source, example: '6.98' })
  @RawValue()
  @IsString()
  @Matches(MONEY, { message: 'total_price must be a decimal string with at most 2 decimal places' })
  total_price!: string;
}

/**
 * `POST /public/v1/expenses`. Anything not listed — debt, recurring, category split, trip payer,
 * receipt, source — is refused by the global pipe (`forbidNonWhitelisted` → `validation_failed`).
 */
export class PublicExpenseCreateDto {
  /** Decimal string, > 0, at most two decimal places, e.g. `"12.50"`. */
  @ApiProperty({ type: String, pattern: MONEY.source, example: '42.50' })
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

  /** `HH:mm` (24-hour). */
  @ApiPropertyOptional({ type: String, pattern: TIME_HH_MM.source, example: '18:45' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HH_MM, { message: 'time must be HH:mm' })
  time?: string;

  /** One of the account's live expense categories (`GET /categories`). */
  @ApiPropertyOptional({ type: String, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string;

  @ApiPropertyOptional({ type: String, maxLength: PUBLIC_DESCRIPTION_MAX, example: 'Weekly groceries' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ type: String, maxLength: PUBLIC_MERCHANT_MAX, example: 'Biedronka' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_MERCHANT_MAX)
  merchant?: string;

  @ApiPropertyOptional({ type: String, maxLength: PUBLIC_NOTES_MAX, example: 'Paid with the family card' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_NOTES_MAX)
  notes?: string;

  @ApiPropertyOptional({ type: () => PublicLocationInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicLocationInput)
  location?: PublicLocationInput;

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

  /** Receipt line items. Create only — a PATCH cannot carry them. */
  @ApiPropertyOptional({ type: () => [PublicExpenseItemInput], minItems: 1, maxItems: PUBLIC_ITEMS_MAX })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PUBLIC_ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => PublicExpenseItemInput)
  items?: PublicExpenseItemInput[];
}

/**
 * `PATCH /public/v1/expenses/{id}` — every field optional; an absent field is left unchanged.
 * `null` clears a clearable field (`time`, `category_id`, `description`, `merchant`, `notes`,
 * `location`, `project_id`); `tag_ids: []` removes every tag. `amount`, `currency`, `date` and
 * `tag_ids` cannot be `null`. `items`, `source` and the creator are not writable.
 */
export class PublicExpenseUpdateDto {
  @ApiPropertyOptional({ type: String, pattern: MONEY.source, example: '45.00' })
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

  @ApiPropertyOptional({ type: String, nullable: true, pattern: TIME_HH_MM.source, example: '09:15' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HH_MM, { message: 'time must be HH:mm' })
  time?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', example: EX.categoryId })
  @IsOptional()
  @IsUUID('all')
  category_id?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_DESCRIPTION_MAX, example: 'Groceries and household' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_MERCHANT_MAX, example: 'Lidl' })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_MERCHANT_MAX)
  merchant?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: PUBLIC_NOTES_MAX, example: null })
  @IsOptional()
  @IsString()
  @MaxLength(PUBLIC_NOTES_MAX)
  notes?: string | null;

  @ApiPropertyOptional({ type: () => PublicLocationInput, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicLocationInput)
  location?: PublicLocationInput | null;

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

const ISO_TS = { type: String, format: 'date-time' } as const;
const DECIMAL = { type: String, pattern: '^\\d+(\\.\\d+)?$' } as const;

export class PublicLocation {
  @ApiProperty({ type: Number, example: 52.2297 })
  lat!: number;
  @ApiProperty({ type: Number, example: 21.0122 })
  lng!: number;
  /** `null` when unset, or when the account is end-to-end encrypted (listed in `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'Marszałkowska 10, Warszawa' })
  name!: string | null;
}

/** A tag or project. `name` is `null` at encryption tier 1 (listed in the expense's `encrypted_fields`). */
export class PublicRef {
  @ApiProperty({ type: String, format: 'uuid', example: EX.tagId })
  id!: string;
  @ApiProperty({ type: String, nullable: true, example: 'household' })
  name!: string | null;
}

export class PublicCategorySplit {
  @ApiProperty({ type: String, format: 'uuid', example: EX.categoryId })
  category_id!: string;
  @ApiProperty({ ...DECIMAL, example: '30.00' })
  amount!: string;
}

export class PublicExpenseItem {
  @ApiProperty({ type: String, format: 'uuid', example: EX.itemId })
  id!: string;
  /** `null` at encryption tier 1 (`items.description` in the expense's `encrypted_fields`). */
  @ApiProperty({ type: String, nullable: true, example: 'Milk 2% 1 l' })
  description!: string | null;
  /** Decimal string with three places, e.g. `"1.000"`. */
  @ApiProperty({ ...DECIMAL, example: '2.000' })
  quantity!: string;
  @ApiProperty({ ...DECIMAL, example: '3.49' })
  unit_price!: string;
  @ApiProperty({ ...DECIMAL, example: '6.98' })
  total_price!: string;
  @ApiProperty({ ...DECIMAL, example: '0.00' })
  line_discount!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, example: EX.categoryId })
  category_id!: string | null;
}

/** `created_by_app.id` is the app's public `client_id`, so an integrator can recognise its own writes. */
export class PublicCreatedByApp {
  @ApiProperty({ type: String, example: EX.clientId })
  id!: string;
  @ApiProperty({ type: String, example: 'AI Accounting' })
  name!: string;
}

export class PublicCreatedByUser {
  @ApiProperty({ type: String, format: 'uuid', example: EX.userId })
  id!: string;
  @ApiProperty({ type: String, example: 'Anna' })
  name!: string;
}

export class PublicExpense {
  @ApiProperty({ type: String, format: 'uuid', example: EX.expenseId })
  id!: string;
  /** Decimal string in the expense's own currency, never converted. */
  @ApiProperty({ ...DECIMAL, example: '42.50' })
  amount!: string;
  @ApiProperty({ type: String, example: 'PLN' })
  currency!: string;
  /** `YYYY-MM-DD` */
  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  date!: string;
  /** `HH:mm` as recorded, or `null`. */
  @ApiProperty({ type: String, nullable: true, example: '18:45' })
  time!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, example: EX.categoryId })
  category_id!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Weekly groceries' })
  description!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Biedronka' })
  merchant!: string | null;
  @ApiProperty({ type: String, nullable: true, example: null })
  notes!: string | null;
  @ApiProperty({ type: () => PublicLocation, nullable: true })
  location!: PublicLocation | null;
  @ApiProperty({ type: () => [PublicRef] })
  tags!: PublicRef[];
  @ApiProperty({ type: () => PublicRef, nullable: true })
  project!: PublicRef | null;
  @ApiProperty({ type: () => [PublicCategorySplit] })
  category_splits!: PublicCategorySplit[];
  /** Only on `GET /expenses/{id}` and the changes feed; absent from the list. */
  @ApiPropertyOptional({ type: () => [PublicExpenseItem] })
  items?: PublicExpenseItem[];
  @ApiProperty({ ...DECIMAL, nullable: true, example: null })
  discount_amount!: string | null;
  @ApiProperty({ ...DECIMAL, nullable: true, example: null })
  deposit_amount!: string | null;
  @ApiProperty({ type: Boolean, example: false })
  is_debt!: boolean;
  @ApiProperty({ type: Boolean, example: false })
  is_debt_repayment!: boolean;
  @ApiProperty({ type: Boolean, example: false })
  is_split_receivable!: boolean;
  @ApiProperty({ type: Boolean, example: false })
  is_recurring!: boolean;
  @ApiProperty({ type: String, example: 'api' })
  source!: string;
  @ApiProperty({ type: () => PublicCreatedByApp, nullable: true })
  created_by_app!: PublicCreatedByApp | null;
  @ApiProperty({ type: () => PublicCreatedByUser })
  created_by_user!: PublicCreatedByUser;
  @ApiProperty({ type: Boolean, example: false })
  has_receipt!: boolean;
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

export class PublicExpenseList {
  @ApiProperty({ type: () => [PublicExpense] })
  data!: PublicExpense[];
  @ApiProperty({ type: String, nullable: true, example: EX.cursor })
  next_cursor!: string | null;
  @ApiProperty({ type: Boolean, example: true })
  has_more!: boolean;
}

export class PublicExpenseUpsertChange {
  @ApiProperty({ type: String, enum: ['upsert'], example: 'upsert' })
  type!: 'upsert';
  /** The detail shape, with `items`. */
  @ApiProperty({ type: () => PublicExpense })
  expense!: PublicExpense;
}

export class PublicExpenseDeleteChange {
  @ApiProperty({ type: String, enum: ['delete'], example: 'delete' })
  type!: 'delete';
  @ApiProperty({ type: String, format: 'uuid', example: EX.expenseId })
  id!: string;
  /** ISO-8601 UTC — when the expense was deleted or stopped being visible (became planned). */
  @ApiProperty({ ...ISO_TS, example: '2026-10-31T18:02:40.517Z' })
  deleted_at!: string;
}

@ApiExtraModels(PublicExpenseUpsertChange, PublicExpenseDeleteChange)
export class PublicExpenseChanges {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [{ $ref: getSchemaPath(PublicExpenseUpsertChange) }, { $ref: getSchemaPath(PublicExpenseDeleteChange) }],
      discriminator: {
        propertyName: 'type',
        mapping: {
          upsert: getSchemaPath(PublicExpenseUpsertChange),
          delete: getSchemaPath(PublicExpenseDeleteChange),
        },
      },
    },
  })
  changes!: Array<PublicExpenseUpsertChange | PublicExpenseDeleteChange>;
  /** Always present — on an empty page it equals the cursor sent. Store it and send it next time. */
  @ApiProperty({ type: String, example: EX.cursor })
  next_cursor!: string;
  @ApiProperty({ type: Boolean, example: false })
  has_more!: boolean;
}

export class PublicCategory {
  @ApiProperty({ type: String, format: 'uuid', example: EX.categoryId })
  id!: string;
  /** `null` at encryption tier 1 (then `encrypted_fields` is `["name"]`). */
  @ApiProperty({ type: String, nullable: true, example: 'Groceries' })
  name!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, example: null })
  parent_id!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'cart' })
  icon!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '#4CAF50' })
  color!: string | null;
  @ApiProperty({ type: String, example: 'expense' })
  type!: string;
  @ApiProperty({ type: [String], example: [] })
  encrypted_fields!: string[];
}

export class PublicCategoryList {
  @ApiProperty({ type: () => [PublicCategory] })
  data!: PublicCategory[];
}

export class PublicAccountUser {
  @ApiProperty({ type: String, format: 'uuid', example: EX.userId })
  id!: string;
  @ApiProperty({ type: String, example: 'Anna' })
  name!: string;
  @ApiProperty({ type: String, example: 'PLN' })
  base_currency!: string;
}

export class PublicAccount {
  @ApiProperty({ type: String, format: 'uuid', example: EX.accountId })
  id!: string;
  @ApiProperty({ type: String, example: 'Family budget' })
  name!: string;
  @ApiProperty({ type: String, enum: ['personal', 'business', 'shared', 'investment', 'trip'], example: 'shared' })
  type!: string;
  @ApiProperty({ type: String, example: 'PLN' })
  base_currency!: string;
  @ApiProperty({ type: String, enum: ['owner', 'editor'], example: 'owner' })
  role!: string;
  @ApiProperty({ type: String, enum: ['none', 'text'], example: 'none' })
  encryption!: 'none' | 'text' | 'full';
  @ApiProperty({ type: Boolean, example: false })
  read_only!: boolean;
  @ApiProperty({ type: () => PublicAccountUser })
  user!: PublicAccountUser;
}

export class PublicConnectedAccount {
  @ApiProperty({ type: String, format: 'uuid', example: EX.accountId })
  id!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Family budget' })
  name!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['personal', 'business', 'shared', 'trip', 'investment'], example: 'shared' })
  type!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'PLN' })
  base_currency!: string | null;
  @ApiProperty({ type: String, enum: ['read', 'read_write'], example: 'read_write' })
  access!: 'read' | 'read_write';
  @ApiProperty({ type: Boolean, example: true })
  active!: boolean;
  @ApiProperty({ type: String, enum: ['role', 'encrypted', 'archived'], nullable: true, example: null })
  reason!: 'role' | 'encrypted' | 'archived' | null;
}

export class PublicConnectedAccountList {
  @ApiProperty({ type: () => [PublicConnectedAccount] })
  data!: PublicConnectedAccount[];
}
