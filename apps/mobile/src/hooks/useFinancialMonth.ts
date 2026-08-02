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
 * Reads the current account's raw (un-normalized) anchor day straight from the
 * store, for callers with no React subscription in scope — budgetStore is a
 * Zustand store, not a component, so it cannot use the hook below.
 *
 * `currentAccount` is a selector *method* on accountStore (`() => Account |
 * null`), not a plain field — it must be invoked, mirroring every other
 * consumer (e.g. FamilyFeedWidget.tsx's `s.currentAccount()`). This is the
 * one place that invocation happens for non-component callers, so it can be
 * unit-tested with `useAccountStore` mocked — there is no
 * @testing-library/react-native in this repo to render the hook itself.
 */
export function readAnchorDay(): number | null {
  return useAccountStore.getState().currentAccount()?.monthAnchorDay ?? null;
}

/** `YYYY-MM-DD` for `now` in local time — a memo key that rolls over at midnight. */
function dayBucket(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The single place the app reads the account's financial month. Screens must go
 * through this rather than reaching into accountStore, so waves 2 and 3 stay a
 * one-file change if the anchor ever moves.
 *
 * Keeps its own reactive subscription (does NOT call `readAnchorDay`/`getState()`)
 * so the hook re-renders on account switch.
 */
export function useFinancialMonth() {
  const anchorRaw = useAccountStore((s) => s.currentAccount()?.monthAnchorDay ?? null);
  const now = new Date();
  // Every period boundary (month-end, or the anchor day) is also a day
  // boundary, so bucketing the memo key by local calendar day is enough to
  // pick up a rollover — without it, a screen that stays mounted across
  // midnight keeps rendering the previous window until `anchorRaw` happens
  // to change, which is rare. No timer/interval needed: this recomputes on
  // every render and only actually changes the memoized value once a day.
  const today = dayBucket(now);

  // `now` is intentionally not a dep — it is a fresh Date every render and
  // would defeat the memo; `today` (derived from it) already captures the
  // one thing about `now` that should trigger a recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => resolveFinancialMonth({ monthAnchorDay: anchorRaw }, now),
    [anchorRaw, today],
  );
}
