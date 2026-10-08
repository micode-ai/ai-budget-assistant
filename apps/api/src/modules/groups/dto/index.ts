import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
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

  @IsIn(SHARE_TYPES as unknown as string[])
  splitType: (typeof SHARE_TYPES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupExpenseShareInputDto)
  shares: GroupExpenseShareInputDto[];
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

export class LinkGuestDto {
  @IsString()
  @Matches(/^[a-f0-9]{32}$/)
  code: string;
}
