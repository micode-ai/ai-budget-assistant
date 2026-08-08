import type { WalletSummary } from '@budget/shared-types';

/**
 * Resolving "how much is on that account, in this currency" for the transfer form.
 *
 * Two sources, deliberately ordered: the current account's summary is computed
 * locally from SQLite, so it is exact and survives offline; every other account
 * comes from `GET /wallet/summaries`, cached in MMKV. An account with no data in
 * either source returns null so the UI can show a dash — never a fabricated zero,
 * which would read as "this account is empty".
 */

export function findCurrencyBalance(
  summaries: WalletSummary[] | undefined,
  currencyCode: string,
): number | null {
  if (!summaries) return null;
  const row = summaries.find((s) => s.currencyCode === currencyCode);
  return row ? row.currentBalance : null;
}

export interface BalanceSources {
  /** Server-provided balances for every account the user belongs to. */
  accountSummaries: Record<string, WalletSummary[]>;
  /** Locally computed summary of the currently selected account. */
  localSummary: WalletSummary[];
  currentAccountId: string | null;
}

export function resolveAccountBalance(
  sources: BalanceSources,
  accountId: string,
  currencyCode: string,
): number | null {
  if (!accountId) return null;

  if (accountId === sources.currentAccountId) {
    const local = findCurrencyBalance(sources.localSummary, currencyCode);
    if (local !== null) return local;
  }

  return findCurrencyBalance(sources.accountSummaries[accountId], currencyCode);
}

/**
 * Whether the entered amount exceeds what we believe is available.
 *
 * Only ever a warning: this is a tracker, not a bank. Transfers get entered after
 * the fact, and an account whose initial balance was never set will legitimately
 * look emptier than it is. Unknown balance means no warning at all.
 */
export function exceedsAvailable(amount: number, available: number | null): boolean {
  if (available === null) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return amount > available;
}
