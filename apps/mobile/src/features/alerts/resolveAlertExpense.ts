import type { TFunction } from 'i18next';
import type { AnomalyAlert, Expense } from '@budget/shared-types';
import { useExpenseStore } from '@/stores/expenseStore';
import { showAlert } from '@/utils/alert';

/**
 * An anomaly alert deep-links by the expense's SERVER PK, but a locally-created row
 * is keyed by its clientId and only learns its serverId once it has synced/pulled.
 * Resolve against the live store the same 4-way way the detail/merge screens do.
 *
 * Added for the desktop dashboard's attention panel, which does not NAVIGATE to
 * `expense/[id]` with the id — it hosts `ExpenseDialog`, which needs the row
 * itself. Returning the expense rather than a boolean is the only difference;
 * `isExpenseResolvableLocally` below is now expressed in terms of it so the
 * four-way match cannot exist in two places and drift. `.some(p)` and
 * `!!.find(p)` are the same answer for the same predicate, so no caller of the
 * boolean form sees any change.
 */
export function findAlertExpense(id?: string | null): Expense | null {
  if (!id) return null;
  return (
    useExpenseStore
      .getState()
      .expenses.find(
        (e) =>
          !e.isDeleted &&
          (e.id === id || e.serverId === id || e.clientId === id || e.localId === id),
      ) ?? null
  );
}

export function isExpenseResolvableLocally(id?: string | null): boolean {
  return findAlertExpense(id) !== null;
}

/** Everything `openAlertTargets` used to read off the screen's own closure/state. */
export interface OpenAlertTargetsDeps {
  canEdit: boolean;
  dismiss: (id: string) => void;
  t: TFunction;
  setResolvingId: (id: string | null) => void;
}

/**
 * Open the expense(s) an alert references. A locally-created row may not carry its
 * serverId yet, so if the target isn't resolvable we force ONE fresh expense pull
 * (which backfills serverId) and retry — only then, if it's still missing, do we
 * conclude the duplicate was already resolved (deleted/merged) and clear the alert.
 * This is what fixes "the expense won't open from the alert" for existing alerts.
 */
export async function openAlertTargets(
  alert: AnomalyAlert,
  ids: (string | undefined)[],
  navigate: () => void,
  { canEdit, dismiss, t, setResolvingId }: OpenAlertTargetsDeps,
): Promise<void> {
  const need = ids.filter((x): x is string => !!x);
  if (need.every(isExpenseResolvableLocally)) {
    navigate();
    return;
  }
  setResolvingId(alert.id);
  try {
    await useExpenseStore.getState().loadExpenses({ force: true });
  } catch {
    // offline / pull failed — fall through to the post-pull check
  }
  setResolvingId(null);
  if (need.every(isExpenseResolvableLocally)) {
    navigate();
    return;
  }
  // Still missing after a fresh pull → genuinely resolved/removed. Clear the stale
  // alert instead of dropping the user on a confusing "Expense not found" screen.
  if (canEdit) dismiss(alert.id);
  showAlert(t('alerts.alreadyResolvedTitle'), t('alerts.alreadyResolvedBody'));
}
