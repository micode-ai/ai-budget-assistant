import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { computeColdStartGate } from '@/hooks/useColdStartGate';
import { resolveWebFirstRun, type WebFirstRunOutcome } from '@/features/onboarding/resolveWebFirstRun';
import {
  FIRST_RUN_WAIT_TIMEOUT_MS,
  hasPullAnswered,
  resolveFirstRunView,
  shouldMarkFirstRunSeen,
  type FirstRunView,
} from '@/features/onboarding/webFirstRunView';

export interface WebFirstRunState {
  /** What the dashboard should draw. */
  view: FirstRunView;
  /**
   * Have both transaction pulls answered this session? The dashboard uses this
   * to decide whether a derived checklist is built on evidence or on the empty
   * readings a web client gives before the server answers.
   */
  pullAnswered: boolean;
  /** "I'll do this later" — sets `seen`, revealing the ordinary dashboard. */
  skip: () => void;
}

/**
 * The desktop dashboard's first-run state machine: subscriptions, the wait
 * bound, and the two exits. Every decision that can be wrong is in the two
 * pure modules it calls (`resolveWebFirstRun`, `webFirstRunView`); nothing
 * renders a component in this repo's CI, so this file is deliberately thin
 * glue with no arithmetic of its own.
 *
 * Web-only by construction, not by a platform check: the only importer is
 * `DashboardDesktop`, which only `DashboardView.web.tsx` reaches, so this
 * never enters the native bundle. `useFirstRunOnboarding` (native's own
 * trigger) bails on web, so the two never both run.
 *
 * ## The predicate is not evaluated until the gate is open
 *
 * Structural, not a guard clause. `resolveWebFirstRun` answers `'suppress'`
 * for `gateOpen: false`, so a single evaluation with the gate shut, combined
 * with any latch on the result, would permanently suppress the first-run state
 * for every user — invisibly, since nothing renders in CI and the symptom is
 * an absence. Calling it only inside the `gateOpen` branch means that value can
 * never be produced here at all. Mirrors how `useFirstRunOnboarding` takes
 * `gateOpen` and returns before doing any work.
 *
 * `fontsLoaded` is passed as `true` because this component cannot be on screen
 * otherwise: `RootNavigator` returns `null` — rendering no `<Stack>` and
 * therefore no dashboard — until fonts have loaded. The other two inputs are
 * read live rather than assumed, because a sign-out flips them while this tree
 * is still mounted.
 *
 * ## Two exits, and why both write the same flag
 *
 * The spec's Exit section: the state ends when a transaction lands or when
 * "I'll do this later" is clicked, and *both* leave `seen === true`, so a
 * refresh does not bring it back. `skip` writes it directly; the effect below
 * writes it the moment there is positive evidence of activity. One flag, two
 * paths, and it is persisted rather than a ref — so it survives a remount and
 * a browser reload, which a ref does not.
 *
 * That effect is also what makes "must not flip back to first-run on a later
 * empty pull" true for a user who was never shown the state at all: an
 * established user's very first answered pull marks `seen`, so a later pull
 * that comes back empty for whatever reason can no longer produce `'show'`.
 * This is the same guard `useFirstRunOnboarding` applies on native ("a
 * non-empty account marks the flag seen"), for the same reason, and `seen`
 * has always been a property of the install rather than of the account.
 */
export function useWebFirstRun(): WebFirstRunState {
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const seen = useFirstRunStore((s) => s.seen);
  const nextAfter = useFirstRunStore((s) => s.nextAfter);
  const markSeen = useFirstRunStore((s) => s.markSeen);

  const canEdit = useAccountStore((s) => s.canEdit());
  const accountId = useAccountStore((s) => s.currentAccountId);

  const expensesPullAt = useExpenseStore((s) => s.lastPullAt);
  const incomesPullAt = useIncomeStore((s) => s.lastPullAt);
  const expenseCount = useExpenseStore((s) => s.expenses.length);
  const incomeCount = useIncomeStore((s) => s.incomes.length);

  const gateOpen = computeColdStartGate({ isInitializing, isAuthenticated, fontsLoaded: true });

  // See "The predicate is not evaluated until the gate is open" above. `'wait'`
  // is the honest answer for a shut gate: we are mid-bootstrap or mid-sign-out
  // and know nothing yet. It is also the one value that cannot be latched into
  // anything permanent — the timer below is the only thing that reads it, and
  // its result only ever moves the screen towards the ordinary dashboard.
  const outcome: WebFirstRunOutcome = gateOpen
    ? resolveWebFirstRun({
        gateOpen,
        seen,
        canEdit,
        accountId,
        nextAfter,
        expensesPullAt,
        incomesPullAt,
        expenseCount,
        incomeCount,
      })
    : 'wait';

  // Bounded wait. The effect re-runs only when `outcome` changes value (a
  // string, compared by value), so a steady `'wait'` arms exactly one timer;
  // the cleanup clears it so the loser never leaks a handle, the same
  // `clearTimeout`-in-cleanup shape `attemptRestoreSession` uses.
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  useEffect(() => {
    if (outcome !== 'wait') return;
    const id = setTimeout(() => setWaitTimedOut(true), FIRST_RUN_WAIT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [outcome]);

  // The whole rule is in `shouldMarkFirstRunSeen` — including the `gateOpen`
  // and `seen` conditions — so the exit condition is unit-tested rather than
  // living in an effect nothing in this repo can render.
  const markSeenNow = shouldMarkFirstRunSeen({
    gateOpen,
    seen,
    expensesPullAt,
    incomesPullAt,
    expenseCount,
    incomeCount,
  });

  useEffect(() => {
    if (!markSeenNow) return;
    markSeen();
  }, [markSeenNow, markSeen]);

  return {
    view: resolveFirstRunView({ outcome, waitTimedOut }),
    pullAnswered: hasPullAnswered({ expensesPullAt, incomesPullAt }),
    skip: markSeen,
  };
}
