import { IsArray, IsIn, ArrayMaxSize, ArrayUnique, ValidateNested, IsString, MaxLength, Matches, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  SettleMethod,
  UserPaymentMethod,
  ReplaceUserPaymentMethodsDto as ReplaceUserPaymentMethodsShape,
  UpdateVoiceDigestDto as UpdateVoiceDigestDtoShape,
  VoiceDigestChannel,
} from '@budget/shared-types';

// Must stay byte-for-byte identical to users.controller.ts's PAYMENT_METHODS /
// PAYMENT_HANDLE_REGEX (and AccountMemberPaymentInfoDto's in modules/accounts/dto/index.ts,
// the trip-settle-up counterpart) — three payment-handle paths (legacy user-level pair,
// account-member/trip, and this multi-method list) that must never drift apart. `+` and
// space are deliberate: BLIK handles are phone numbers.
const PAYMENT_METHOD_VALUES: SettleMethod[] = ['blik', 'revolut', 'paypal', 'cash', 'other'];
const PAYMENT_HANDLE_REGEX = /^[A-Za-z0-9+ ._-]{1,50}$/;

export class UserPaymentMethodItemDto implements UserPaymentMethod {
  @IsIn(PAYMENT_METHOD_VALUES)
  method: SettleMethod;

  @IsString()
  @MaxLength(200)
  @Matches(PAYMENT_HANDLE_REGEX)
  handle: string;
}

/**
 * Body for `PUT /users/me/payment-methods`. Real class-validator class (not the bare
 * shared-types interface) — an inline TS type is erased at runtime, so the global
 * ValidationPipe couldn't whitelist/validate it. At most 5 entries; `ArrayUnique` rejects
 * a duplicate `method` (one handle per method — the DB's `@@unique([userId, method])` is
 * the backstop, this is the friendly 400 before that). An empty array is valid — it
 * clears the list, and the guest page then falls back to the legacy single pair.
 */
export class ReplaceUserPaymentMethodsDto implements ReplaceUserPaymentMethodsShape {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique((item: UserPaymentMethodItemDto) => item.method, { message: 'Duplicate payment method' })
  @ValidateNested({ each: true })
  @Type(() => UserPaymentMethodItemDto)
  paymentMethods: UserPaymentMethodItemDto[];
}

// Must stay in sync with VoiceDigestChannel in packages/shared-types/src/dto/voice-digest.ts.
// This is only the HTTP-level shape check (type + range); VoiceDigestService.updateSettings
// still owns the business rule that the channel must be one this user has actually linked.
const VOICE_DIGEST_CHANNEL_VALUES: VoiceDigestChannel[] = ['telegram', 'whatsapp', 'slack'];

/**
 * Body for `PATCH /users/me/voice-digest`. A real class-validator class (not the bare
 * shared-types interface, same reasoning as `ReplaceUserPaymentMethodsDto` above) so the
 * global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform) actually enforces
 * the shape before it ever reaches `VoiceDigestService.updateSettings`.
 */
export class UpdateVoiceDigestDto implements UpdateVoiceDigestDtoShape {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** 0 = Sunday … 6 = Saturday, in the user's own time zone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  day?: number;

  /** 0–23, in the user's own time zone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @IsIn(VOICE_DIGEST_CHANNEL_VALUES)
  channel?: VoiceDigestChannel;
}
