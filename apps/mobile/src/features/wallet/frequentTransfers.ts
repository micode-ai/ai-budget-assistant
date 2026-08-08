import type { AccountTransfer, Currency } from '@budget/shared-types';

/**
 * A route the user has moved money along before, ready to refill the transfer form.
 *
 * Derived entirely from transfer history that is already in the store — no endpoint,
 * no table. The user explicitly chose this over saved named templates.
 */
export interface FrequentTransfer {
  key: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  /** Amounts and rate of the most recent transfer along this route. */
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  count: number;
  lastDate: number;
}

export interface FrequentTransferOptions {
  /** Accounts still visible to the user. Routes touching anything else are dropped. */
  eligibleAccountIds: Iterable<string>;
  /** Accounts the user may not pay *from* (viewer role). */
  readOnlyAccountIds?: Iterable<string>;
  limit?: number;
}

const DEFAULT_LIMIT = 3;

function timeOf(date: Date | string | number): number {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function frequentTransferKey(t: {
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: string;
  toCurrency: string;
}): string {
  return `${t.fromAccountId}|${t.toAccountId}|${t.fromCurrency}|${t.toCurrency}`;
}

/**
 * Group transfer history into routes, ranked by how often the route was used and
 * then by recency. Each route carries the amounts of its most recent transfer, so
 * tapping the chip reproduces what the user actually did last time.
 */
export function buildFrequentTransfers(
  transfers: AccountTransfer[],
  options: FrequentTransferOptions,
): FrequentTransfer[] {
  const eligible = new Set(options.eligibleAccountIds);
  const readOnly = new Set(options.readOnlyAccountIds ?? []);
  const limit = options.limit ?? DEFAULT_LIMIT;

  const groups = new Map<string, FrequentTransfer>();

  for (const t of transfers) {
    if (t.isDeleted) continue;
    if (!eligible.has(t.fromAccountId) || !eligible.has(t.toAccountId)) continue;
    // A route the user can no longer pay along is a dead end, not a shortcut.
    if (readOnly.has(t.fromAccountId)) continue;
    if (t.fromAccountId === t.toAccountId) continue;

    const key = frequentTransferKey(t);
    const at = timeOf(t.date);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        fromCurrency: t.fromCurrency,
        toCurrency: t.toCurrency,
        fromAmount: t.fromAmount,
        toAmount: t.toAmount,
        exchangeRate: t.exchangeRate,
        count: 1,
        lastDate: at,
      });
      continue;
    }

    existing.count += 1;
    if (at >= existing.lastDate) {
      existing.lastDate = at;
      existing.fromAmount = t.fromAmount;
      existing.toAmount = t.toAmount;
      existing.exchangeRate = t.exchangeRate;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => (b.count - a.count) || (b.lastDate - a.lastDate))
    .slice(0, limit);
}
