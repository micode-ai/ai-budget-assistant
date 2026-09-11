import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AnomalyAlert } from '@budget/shared-types';
import { showAlert } from '@/utils/alert';
import { useAlertStore } from '@/stores/alertStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { useExpenseStore } from '@/stores/expenseStore';
import {
  openAlertTargets as openAlertTargetsImpl,
  findAlertExpense,
} from '@/features/alerts/resolveAlertExpense';
import {
  alertAction,
  mergeTargets,
  buildTrackedSubscription,
  buildMarkRecurringUpdate,
} from '@/features/dashboard/attentionActions';
import type { ExpenseDialogProps } from '@/components/expenses/desktop/ExpenseDialog';
import type { LedgerRow } from '@/features/expenses/desktopTable';

export interface AlertTapThrough {
  /**
   * The alert currently waiting on a forced expense pull, or `null`. Drives an
   * inline spinner and blocks a second tap.
   */
  resolvingId: string | null;
  /** Open whatever an alert references. A no-op for `track`/`none` rows. */
  onAlertPress: (alert: AnomalyAlert) => void;
  /** The inline "Track this subscription" action for a `recurring_suggestion`. */
  onTrack: (alert: AnomalyAlert) => Promise<void>;
  /**
   * The inline "Mark as recurring" action for a `recurring_suggestion` —
   * `onTrack`'s sibling, flagging the alert's own expense as recurring
   * instead of (or as well as) tracking a `UserSubscription`. See
   * `buildMarkRecurringUpdate`'s doc comment for why this is a second action
   * on the same alert rather than a new alert type.
   */
  onMarkRecurring: (alert: AnomalyAlert) => void;
  /**
   * Ready-made props for `ExpenseDialog`, or `null` when nothing is open. The
   * caller only instantiates the element:
   * `{dialogProps && <ExpenseDialog {...dialogProps} />}`. Every value in it —
   * the trip context included — is decided here, so two surfaces cannot open
   * the same expense with different capabilities.
   */
  dialogProps: ExpenseDialogProps | null;
}

/**
 * Tapping an alert: resolve its target, open it, and mark it read — shared by
 * the dashboard's attention panel and the top bar's alerts panel.
 *
 * ## Why this is a hook and not a second copy
 *
 * It is a ~100-line flow whose correctness depends on *when* one call happens
 * (below), and the alerts panel needed exactly the same behaviour. Two
 * hand-written copies of that is the drift this desktop layer exists to
 * prevent — the same argument that moved the unread filter into
 * `selectUnreadAlerts`, settled the same way.
 *
 * ## The `markRead` ordering rule, carried across deliberately
 *
 * **`markRead` fires only once the target has actually opened**, never when the
 * row is tapped. This is a DELIBERATE divergence from `app/alerts/index.tsx`,
 * which marks read the instant a row is tapped — and it is not a preference.
 *
 * There the ordering is invisible: a read alert stays in that list, only losing
 * its unread accent. On both desktop surfaces the list is built from
 * `selectUnreadAlerts`, so marking read REMOVES the row — and
 * `openAlertTargets` may first spend a whole forced
 * `loadExpenses({ force: true })` round trip resolving the expense. Marking up
 * front would delete the row, and with it the `resolvingId` spinner attached to
 * it, leaving the user looking at nothing at all for the length of that pull: a
 * dead click, on the two surfaces built to be worth staying on.
 *
 * It was found the hard way once. `useAlertTapThrough.test.ts` names it.
 *
 * ## What it deliberately does NOT own
 *
 * The row's own dismiss (`alertStore.dismiss`) and the invitation
 * Accept/Decline. Both are one-line store calls with no ordering rule and no
 * shared state, and each surface already had them; pulling them in would make
 * this the place all alert behaviour lives rather than the place the *subtle*
 * part lives.
 */
export function useAlertTapThrough({ canEdit }: { canEdit: boolean }): AlertTapThrough {
  const { t } = useTranslation();

  const markRead = useAlertStore((s) => s.markRead);
  const dismiss = useAlertStore((s) => s.dismiss);

  const [dialogRow, setDialogRow] = useState<LedgerRow | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Mirrors `ExpensesDesktop`'s own block, which in turn mirrors
  // `app/expense/[id].tsx` — the dialog replaced navigating to that screen, so
  // it has to arrive with the same trip context that screen provides, or a
  // trip account's expense silently loses its split picker when opened from
  // one surface but not another.
  const currentAccount = useAccountStore((s) => s.currentAccount());
  const accountMembersMap = useAccountStore((s) => s.members);
  const loadMembers = useAccountStore((s) => s.loadMembers);
  const isTripAccount = currentAccount?.type === 'trip';
  const tripMembers =
    isTripAccount && currentAccount
      ? (accountMembersMap[currentAccount.id] || []).map((m) => ({
          userId: m.userId,
          name: m.user?.name || m.user?.email || m.userId,
        }))
      : [];

  // Trip accounts only, so an ordinary account makes no extra request.
  // `ExpenseDetailsCard` gates its split picker on `tripMembers.length > 0`,
  // so without this the picker would be missing from an expense opened here
  // and present on the same expense opened from the transactions table — a
  // divergence with no visible cause.
  useEffect(() => {
    if (isTripAccount && currentAccount) loadMembers(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, isTripAccount]);

  const openAlertTargets = useCallback(
    (alert: AnomalyAlert, ids: (string | undefined)[], navigate: () => void) =>
      openAlertTargetsImpl(alert, ids, navigate, { canEdit, dismiss, t, setResolvingId }),
    [canEdit, dismiss, t],
  );

  const onTrack = async (alert: AnomalyAlert) => {
    const input = buildTrackedSubscription(
      alert,
      new Date(),
      useAuthStore.getState().user?.currencyCode || 'USD',
    );
    if (!input) {
      // The alert did not carry enough to build an honest subscription (see
      // `buildTrackedSubscription`). Fall back to the form the alerts screen
      // has always opened, prefilled with whatever IS there, rather than
      // leaving a button that does nothing.
      const p = alert.params as Record<string, string>;
      router.push({
        pathname: '/subscriptions/new' as never,
        params: { name: p.merchant, amount: String(p.amount), detectedFrom: p.merchant },
      });
      return;
    }
    try {
      await useUserSubscriptionStore.getState().createSubscription(input);
      // Only after the server confirms. Dismissing first would lose the alert
      // on a failed create, and the suggestion fires once per merchant EVER
      // (`dedupKey: recur:{merchant}`), so it would never come back.
      dismiss(alert.id);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  /**
   * Unlike `onTrack`, this never rejects (`expenseStore.updateExpense` is
   * fire-and-forget — it applies optimistically and swallows its own server
   * error into a `console.warn` retry-on-next-sync, the same as every other
   * expense edit in this app), so there is no try/catch here and nothing to
   * await: the local write and the dismiss both happen synchronously, in the
   * same tick the button was pressed.
   */
  const onMarkRecurring = (alert: AnomalyAlert) => {
    const update = buildMarkRecurringUpdate(alert);
    if (!update) return; // the button that calls this only renders when non-null
    const { expenseId, ...patch } = update;
    useExpenseStore.getState().updateExpense(expenseId, patch);
    dismiss(alert.id);
  };

  const onAlertPress = (alert: AnomalyAlert) => {
    if (resolvingId) return; // a resolve pull is already in flight
    const action = alertAction(alert, canEdit);
    // The Track row's own button owns its action; the row body does nothing,
    // so a stray click cannot create a subscription.
    if (action === 'track' || action === 'none') return;

    // See the hook's doc comment: read is marked only once the target has
    // actually opened. Moving this call earlier is the defect.
    const markHandled = () => {
      if (canEdit) markRead(alert.id);
    };

    if (action === 'merge') {
      const { aId, bId } = mergeTargets(alert);
      void openAlertTargets(alert, [aId, bId], () => {
        markHandled();
        router.push({ pathname: '/expense/merge' as never, params: { aId, bId } });
      });
      return;
    }

    const targetId = alert.expenseId as string;
    void openAlertTargets(alert, [targetId], () => {
      const expense = findAlertExpense(targetId);
      // `openAlertTargets` only calls this once the id resolves, so the guard
      // is belt-and-braces — but opening a dialog on a missing row would be a
      // blank modal with no way to explain itself.
      if (!expense) return;
      markHandled();
      setDialogRow({ kind: 'expense', expense });
    });
  };

  return {
    resolvingId,
    onAlertPress,
    onTrack,
    onMarkRecurring,
    dialogProps: dialogRow
      ? {
          row: dialogRow,
          onClose: () => setDialogRow(null),
          canEdit,
          isTripAccount,
          tripMembers,
        }
      : null,
  };
}
