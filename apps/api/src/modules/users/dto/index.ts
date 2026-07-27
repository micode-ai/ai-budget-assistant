import { IsArray, IsIn, ArrayMaxSize, ArrayUnique, ValidateNested, IsString, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import type { SettleMethod, UserPaymentMethod, ReplaceUserPaymentMethodsDto as ReplaceUserPaymentMethodsShape } from '@budget/shared-types';

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
