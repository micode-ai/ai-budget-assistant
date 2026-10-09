import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type {
  CreateGroupDto as ICreateGroupDto,
  JoinGroupDto as IJoinGroupDto,
  UpdateGroupDto as IUpdateGroupDto,
  UpdateGroupMemberDto as IUpdateGroupMemberDto,
  CreateGroupExpenseDto as ICreateGroupExpenseDto,
  UpdateGroupExpenseDto as IUpdateGroupExpenseDto,
  CreateGroupSettlementDto as ICreateGroupSettlementDto,
} from '@budget/shared-types';

export const SHARE_TYPES = ['equal', 'exact', 'percentage', 'shares'] as const;
export const SETTLE_METHODS = ['blik', 'revolut', 'paypal', 'cash', 'other'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGroupDto implements ICreateGroupDto {
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @Matches(/^[A-Z]{3}$/)
  currencyCode: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  myDisplayName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(49)
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value))
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  memberNames?: string[];
}

export class JoinGroupDto implements IJoinGroupDto {
  @IsString()
  @Length(8, 128)
  guestToken: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  displayName?: string;
}

export class UpdateGroupDto implements IUpdateGroupDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string | null;

  @IsOptional()
  @IsBoolean()
  guestAccess?: boolean;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;
}

export class ArchiveGroupDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class AddGroupMemberDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  displayName: string;
}

export class UpdateGroupMemberDto implements IUpdateGroupMemberDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  displayName?: string;

  @IsOptional()
  @IsIn(SETTLE_METHODS as unknown as string[])
  paymentMethod?: (typeof SETTLE_METHODS)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentHandle?: string | null;
}

export class GroupExpenseShareInputDto {
  @IsUUID()
  memberId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000)
  value?: number;
}

/** ABA-655: a line of an itemised expense, in the entry currency. Sums are checked in the service. */
export class GroupExpenseItemInputDto {
  /** Only on an edit: keeps that line (re-scoped to the expense in the service). */
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  totalPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  lineDiscount?: number;
}

export class CreateGroupExpenseDto implements ICreateGroupExpenseDto {
  @IsString()
  @Length(8, 64)
  clientRequestId: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsUUID()
  paidByMemberId: string;

  // Required unless the expense is itemised (ABA-655): its shares are resolved from claims.
  @ValidateIf((o: CreateGroupExpenseDto) => o.items === undefined)
  @IsIn(SHARE_TYPES as unknown as string[])
  splitType?: (typeof SHARE_TYPES)[number];

  @ValidateIf((o: CreateGroupExpenseDto) => o.items === undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupExpenseShareInputDto)
  shares?: GroupExpenseShareInputDto[];

  /** ABA-655: presence makes the expense itemised. At most 100 lines; claims open for 7 days. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GroupExpenseItemInputDto)
  items?: GroupExpenseItemInputDto[];

  /** ABA-655: basket-wide discount in the entry currency. Itemised expenses only. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  discountAmount?: number;

  /**
   * ABA-654: the currency `amount` is entered in. Default: the group currency. Another one is
   * converted ONCE, now, into the group currency; the original amount and the rate are stored too.
   */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  /** Manual rate override: the value of 1 `currencyCode` in the group currency. Ignored for the group currency. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  @Max(1_000_000)
  fxRate?: number;
}

export class UpdateGroupExpenseDto implements IUpdateGroupExpenseDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsUUID()
  paidByMemberId?: string;

  @IsOptional()
  @IsIn(SHARE_TYPES as unknown as string[])
  splitType?: (typeof SHARE_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupExpenseShareInputDto)
  shares?: GroupExpenseShareInputDto[];

  /**
   * ABA-654: the currency `amount` is entered in. Default: the group currency. Another one is
   * converted ONCE, now, into the group currency; the original amount and the rate are stored too.
   */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  /** Manual rate override: the value of 1 `currencyCode` in the group currency. Ignored for the group currency. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  @Max(1_000_000)
  fxRate?: number;

  /** ABA-655, itemised only: the full new line list (an `id` keeps a line and its claims). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GroupExpenseItemInputDto)
  items?: GroupExpenseItemInputDto[];

  /** ABA-655, itemised only; null clears it. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  discountAmount?: number | null;
}

/** PUT /groups/:groupId/expenses/:expenseId/claims/me (ABA-655). Ids are re-scoped to the expense. */
export class SetMyGroupClaimsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  itemIds: string[];
}

export class GroupClaimEntryDto {
  @IsUUID()
  memberId: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  itemIds: string[];

  /** Item id -> basis points. class-validator has no "record of bounded integers": the service checks it. */
  @IsOptional()
  @IsObject()
  shareBp?: Record<string, number>;
}

/** PUT /groups/:groupId/expenses/:expenseId/claims (ABA-655): payer, creator or owner. */
export class SetGroupClaimsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GroupClaimEntryDto)
  claims: GroupClaimEntryDto[];
}

export class CloseGroupClaimsDto {
  @IsOptional()
  @IsBoolean()
  reopen?: boolean;
}

export class CreateGroupSettlementDto implements ICreateGroupSettlementDto {
  @IsString()
  @Length(8, 64)
  clientRequestId: string;

  @IsUUID()
  fromMemberId: string;

  @IsUUID()
  toMemberId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount: number;

  @IsOptional()
  @IsIn(SETTLE_METHODS as unknown as string[])
  method?: (typeof SETTLE_METHODS)[number];

  @IsInt()
  @Min(0)
  ledgerVersion: number;
}

export class GroupActivityQueryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GroupFxPreviewQueryDto {
  @Matches(/^[A-Z]{3}$/)
  currency: string;
}

export class LinkGuestDto {
  @IsString()
  @Matches(/^[a-f0-9]{32}$/)
  code: string;
}

/** POST /groups/:groupId/owner (ABA-650). The id is re-scoped to the group in the service. */
export class TransferGroupOwnerDto {
  @IsUUID()
  memberId: string;
}
