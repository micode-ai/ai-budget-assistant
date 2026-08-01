import { useMemo } from 'react';
import type { Account } from '@budget/shared-types';
import { financialMonth, normalizeAnchorDay } from '@budget/shared-utils';
import { useAccountStore } from '../stores/accountStore';

/**
 * Pure core, exported for tests. `account` may be null while the store hydrates.
 */
export function resolveFinancialMonth(
  account: Pick<Account, 'monthAnchorDay'> | null,
  now: Date,
): { anchorDay: number | null; current: { start: Date; end: Date } } {
  const anchorDay = normalizeAnchorDay(account?.monthAnchorDay ?? null);
  return { anchorDay, current: financialMonth(now, anchorDay) };
}

/**
 * The single place the app reads the account's financial month. Screens must go
 * through this rather than reaching into accountStore, so waves 2 and 3 stay a
 * one-file change if the anchor ever moves.
 */
export function useFinancialMonth() {
  // currentAccount is a selector *method* on the store (accountStore.ts),
  // not a plain field — it must be invoked, mirroring every other consumer
  // (e.g. FamilyFeedWidget.tsx's `s.currentAccount()`).
  const anchorRaw = useAccountStore((s) => s.currentAccount()?.monthAnchorDay ?? null);

  return useMemo(
    () => resolveFinancialMonth({ monthAnchorDay: anchorRaw }, new Date()),
    [anchorRaw],
  );
}
