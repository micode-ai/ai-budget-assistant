import type { Expense, ShoppingListItem, SafeToSpendResponse } from '@budget/shared-types';
import { buildStoreCentres, type StoreCentre } from '@/features/stores/findNearbyStore';
import { expensesToVisits } from '@/features/stores/expensesToVisits';
import { SHOPPING_MODE_DEFAULTS } from './session';

/**
 * Nothing renders these yet — both notification bodies carry a bare count. They
 * are stored, and kept accurate by `refreshSessionItems`, for the body that
 * would name items: enough to recognise the list at a glance, not the whole
 * list.
 */
export const MAX_SNAPSHOT_LABELS = 3;

/**
 * Everything Shopping Mode's location task will ever need, frozen at the
 * moment the user pressed the button.
 *
 * The task can wake in a headless JS context — the process is alive because
 * the foreground service holds it, but React has not mounted and no Zustand
 * store has hydrated. Anything read from a store there may be empty, and it
 * will be empty in exactly the case this feature exists for: the app was never
 * opened at the shop. So the task reads this, and nothing else.
 *
 * Snapshotting `safeToSpendToday` is deliberate rather than lazy. It is a
 * daily figure that does not move meaningfully inside one shopping trip, and
 * fetching the live value would mean a network call from a background task
 * that may have no hydrated auth store to read a token from.
 */
export interface SessionSnapshot {
  accountId: string;
  /** Frozen so a headless notification is still in the user's language. */
  language: string;
  centres: StoreCentre[];
  uncheckedCount: number;
  uncheckedLabels: string[];
  safeToSpendToday: number | null;
  currencyCode: string | null;
}

/** The two list fields of a snapshot, and the only two that are ever refreshed. */
export type SnapshotListFields = Pick<SessionSnapshot, 'uncheckedCount' | 'uncheckedLabels'>;

/**
 * Shared by the builder and by the in-app refresh, so a mid-trip update can
 * never disagree with what the session was born with. Filter first, cap after:
 * the cap is on how many labels are worth keeping, not on how far down the
 * list we are willing to look — `uncheckedCount` counts all of them.
 */
export function deriveSnapshotListFields(items: ShoppingListItem[]): SnapshotListFields {
  const unchecked = items.filter((i) => !i.isChecked);
  return {
    uncheckedCount: unchecked.length,
    uncheckedLabels: unchecked.slice(0, MAX_SNAPSHOT_LABELS).map((i) => i.rawLabel),
  };
}

export function buildSessionSnapshot(params: {
  accountId: string;
  language: string;
  expenses: Expense[];
  items: ShoppingListItem[];
  safeToSpend: SafeToSpendResponse | null;
}): SessionSnapshot {
  const { accountId, language, expenses, items, safeToSpend } = params;

  const centres = buildStoreCentres(expensesToVisits(expenses), SHOPPING_MODE_DEFAULTS.minVisits);

  return {
    accountId,
    language,
    centres,
    ...deriveSnapshotListFields(items),
    safeToSpendToday: safeToSpend?.safeToSpendToday ?? null,
    currencyCode: safeToSpend?.baseCurrency ?? null,
  };
}
