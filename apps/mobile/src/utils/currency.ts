import type { Currency } from '@budget/shared-types';

export interface CurrencyChangeDeps {
  /** The currently-active base currency (or undefined if none yet). */
  currentCurrency: string | undefined;
  /** Apply the change to local state immediately (optimistic). */
  applyLocal: (code: Currency) => void;
  /** Persist the change server-side. May reject (e.g. offline). */
  persist: (code: Currency) => Promise<unknown>;
  /** Optional handler for a failed persist; failure is non-fatal. */
  onPersistError?: (error: unknown) => void;
}

/**
 * Changes the base/display currency: optimistic local update first (so the UI
 * and the exchangeRateStore subscription react instantly), then a
 * fire-and-forget server persist whose failure is non-fatal (works offline).
 * No-ops when the currency is unchanged.
 */
export function applyCurrencyChange(next: Currency, deps: CurrencyChangeDeps): void {
  if (!next || deps.currentCurrency === next) return;
  deps.applyLocal(next);
  deps.persist(next).catch((error) => deps.onPersistError?.(error));
}
