import type { SettleMethod } from '@budget/shared-types';

/**
 * Mirrors apps/api/src/modules/users/users.controller.ts's PAYMENT_HANDLE_REGEX
 * byte-for-byte — the `+` and space are deliberate (BLIK handles are phone
 * numbers). Keep both in sync or a handle that validates locally could still
 * 400 server-side (or vice versa).
 */
export const PAYMENT_HANDLE_REGEX = /^[A-Za-z0-9+ ._-]{1,50}$/;

export function isValidPaymentHandle(handle: string): boolean {
  return PAYMENT_HANDLE_REGEX.test(handle);
}

export type PaymentConsequence = 'link' | 'manual' | 'none';

/**
 * Maps a payment method to what it actually produces on a receipt-split guest
 * link — mirrors apps/api/src/modules/receipt-split/helpers/guest-page.ts's
 * buildGuestPayLink: revolut/paypal build a real tappable pay link ('link'),
 * blik has no cross-bank deep link so the guest page shows manual
 * instructions instead ('manual'), and cash/other (or no method at all) show
 * no payment action ('none').
 */
export function getPaymentConsequence(method: SettleMethod | null): PaymentConsequence {
  if (method === 'revolut' || method === 'paypal') return 'link';
  if (method === 'blik') return 'manual';
  return 'none';
}

export interface PaymentInfoPatch {
  paymentMethod: SettleMethod | null;
  paymentHandle: string | null;
}

export interface PaymentInfoPersistDeps {
  /** Apply optimistically to local state (authStore user). Always runs. */
  applyLocal: (patch: PaymentInfoPatch) => void;
  /** Persist server-side. May reject (e.g. offline). */
  persist: (patch: PaymentInfoPatch) => Promise<unknown>;
  /** Optional handler for a failed persist; failure is non-fatal. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Mirrors applyCurrencyChange/applyThemePatch: optimistic local update first,
 * then a fire-and-forget server persist whose failure is non-fatal (works
 * offline).
 */
export function applyPaymentInfoPatch(patch: PaymentInfoPatch, deps: PaymentInfoPersistDeps): void {
  deps.applyLocal(patch);
  deps.persist(patch).catch((error) => deps.onPersistError?.(error));
}
