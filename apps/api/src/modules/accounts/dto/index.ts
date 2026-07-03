import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsNumber,
  IsDateString,
  IsIn,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import type { SettleMethod } from '@budget/shared-types';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(['personal', 'business', 'shared', 'investment', 'trip'])
  type: 'personal' | 'business' | 'shared' | 'investment' | 'trip';

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsDateString()
  tripStartDate?: string;

  @IsOptional()
  @IsDateString()
  tripEndDate?: string; // required by the service when type === 'trip'
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  invitedUserId?: string;

  @IsOptional()
  @IsEnum(['editor', 'viewer'])
  role?: 'editor' | 'viewer';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class AcceptInvitationDto {
  @IsString()
  inviteCode: string;
}

export class RespondToInvitationDto {
  @IsIn(['accept', 'decline'])
  action: 'accept' | 'decline';
}

export class UpdateMemberRoleDto {
  @IsEnum(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}

export class AccountMemberPaymentInfoDto {
  @IsIn(['blik', 'revolut', 'paypal', 'cash', 'other'])
  paymentMethod: SettleMethod;

  // Defense in depth (ABA settle-up security fix): allowlist the character set so this
  // free-text field can never be used to break out of the revolut.me/paypal.me deep-link
  // templates it gets interpolated into (trip-settle-up.service.ts). Kept slightly wider
  // than the task brief's plain [A-Za-z0-9._-] to include `+` and space — BLIK's
  // paymentHandle is a phone number per the design spec
  // (docs/superpowers/specs/2026-07-01-group-trip-wallet-design.md, "+48 XXX XXX XXX"),
  // and a strict username-only regex would reject every legitimate BLIK handle.
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9+ ._-]{1,50}$/)
  paymentHandle: string;
}
