import type { SettleMethod, UserPaymentMethod } from '@budget/shared-types';

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

// ── Multi-method list editor (part 2) ──

/** All five methods the server accepts — mirrors `PAYMENT_METHODS` in
 * users.controller.ts / `PAYMENT_METHOD_VALUES` in users/dto/index.ts. */
export const ALL_PAYMENT_METHODS: SettleMethod[] = ['revolut', 'paypal', 'blik', 'cash', 'other'];

export interface PaymentMethodRow {
  method: SettleMethod;
  handle: string;
}

/**
 * Which methods remain pickable for the row at `excludeIndex` — every method not
 * already claimed by a DIFFERENT row. The DB enforces one handle per method
 * (`@@unique([userId, method])`), so the picker must never offer a method a sibling
 * row already uses — otherwise Save 400s on something the UI let the user pick. The
 * row's OWN current method stays selectable (excluded from "used by others") so
 * re-opening its own picker doesn't make its current choice vanish.
 */
export function getAvailableMethods(rows: { method: SettleMethod }[], excludeIndex: number): SettleMethod[] {
  const usedByOthers = new Set(rows.filter((_, i) => i !== excludeIndex).map((r) => r.method));
  return ALL_PAYMENT_METHODS.filter((m) => !usedByOthers.has(m));
}

/**
 * Whether the whole list is safe to submit to `PUT /users/me/payment-methods`: at
 * most 5 rows, no two rows sharing a method, and every row has a non-blank handle
 * that passes `isValidPaymentHandle`. An empty list is valid (it clears the list).
 * Mirrors the server's own checks (`ReplaceUserPaymentMethodsDto`) so a user is never
 * shown "Save" as enabled for something the API would reject.
 */
export function isValidPaymentMethodList(rows: PaymentMethodRow[]): boolean {
  if (rows.length > 5) return false;
  const methods = rows.map((r) => r.method);
  if (new Set(methods).size !== methods.length) return false;
  return rows.every((r) => {
    const trimmed = r.handle.trim();
    return trimmed.length > 0 && isValidPaymentHandle(trimmed);
  });
}

/** Trims every handle for the wire payload — the same trim `isValidPaymentMethodList`
 * validates against, so what's validated is exactly what gets sent. */
export function toPaymentMethodPayload(rows: PaymentMethodRow[]): UserPaymentMethod[] {
  return rows.map((r) => ({ method: r.method, handle: r.handle.trim() }));
}

/**
 * Seeds the list editor's initial rows: the authoritative `paymentMethods` list when
 * non-empty, otherwise the LEGACY single pair as one pre-filled row (so an existing
 * user sees their prior setting instead of a blank editor), otherwise empty. Never
 * combines both — `paymentMethods` alone is the whole answer once it has any rows,
 * matching the server's own `resolvePayer` resolution order.
 */
export function seedPaymentMethodRows(
  user:
    | { paymentMethods?: UserPaymentMethod[]; paymentMethod?: SettleMethod | null; paymentHandle?: string | null }
    | null
    | undefined,
): PaymentMethodRow[] {
  if (user?.paymentMethods && user.paymentMethods.length > 0) {
    return user.paymentMethods.map((m) => ({ method: m.method, handle: m.handle }));
  }
  if (user?.paymentMethod && user.paymentHandle) {
    return [{ method: user.paymentMethod, handle: user.paymentHandle }];
  }
  return [];
}

export interface PaymentMethodsPersistDeps {
  /** Apply optimistically to local state (authStore user). Always runs. */
  applyLocal: (methods: UserPaymentMethod[]) => void;
  /** Persist server-side via `PUT /users/me/payment-methods`. May reject (e.g. offline). */
  persist: (methods: UserPaymentMethod[]) => Promise<unknown>;
  /** Optional handler for a failed persist; failure is non-fatal. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Mirrors `applyPaymentInfoPatch`/`applyCurrencyChange`/`applyThemePatch`: optimistic
 * local update first, then a fire-and-forget server persist whose failure is
 * non-fatal (works offline).
 */
export function applyPaymentMethodsPatch(methods: UserPaymentMethod[], deps: PaymentMethodsPersistDeps): void {
  deps.applyLocal(methods);
  deps.persist(methods).catch((error) => deps.onPersistError?.(error));
}
