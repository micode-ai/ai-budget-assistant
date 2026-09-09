/**
 * What the desktop dashboard is allowed to state as fact yet, and when to show
 * a loader instead.
 *
 * ## Why this exists
 *
 * On web `db/client.web.ts` is an in-memory mock, so every local read returns
 * empty and the only real source is the network. A widget that renders
 * `0,00 zł` from an empty store is therefore indistinguishable from one
 * reporting a genuine zero — and that is not a cosmetic problem. The clearest
 * case is Financial Health: `useFinancialHealthScore` always includes the debt
 * component (no debts = full 25/25) and includes budget adherence as soon as
 * budgets load (no expenses = no budget exceeded = another 25/25), so with
 * budgets loaded and expenses still in flight it reported **"Great, 100"** on
 * an account it knew nothing about.
 *
 * This is the same rule ABA-506/518/519 apply to failed loads, extended to
 * loads that simply have not answered yet: a value nobody has confirmed must
 * not be drawn as a number.
 *
 * ## Why it is NOT part of `resolveWebFirstRun`
 *
 * That function's `'wait'` answers one specific question — is this user new —
 * and it waits on the transaction pulls because a zero transaction COUNT is
 * ambiguous. Whether the wallet or the budget list has answered has no bearing
 * on whether someone is new, and folding it in would make the onboarding
 * decision depend on unrelated requests.
 *
 * ## Why native is always ready
 *
 * On native SQLite holds the whole account and works offline, so a `lastPullAt`
 * of `null` says nothing about whether there is data to show — it usually just
 * means the device is offline with a full local mirror. Showing dashes there
 * would hide real, correct figures. `isWeb` is an input rather than a
 * `Platform` read so this module stays pure and testable.
 */

export interface DashboardReadinessInputs {
  /** `Platform.OS === 'web'`, passed in to keep this module platform-free. */
  isWeb: boolean;
  /** `expenseStore.lastPullAt` — `null` = the server has not answered this session. */
  expensesPullAt: number | null;
  /** `incomeStore.lastPullAt` — same. */
  incomesPullAt: number | null;
  /** `walletStore.lastPullAt` — same. */
  walletPullAt: number | null;
  /** `budgetStore.lastPullAt` (added in ABA-518) — same. */
  budgetsPullAt: number | null;
  /**
   * `categoryStore.isInitialized`. A boolean rather than a stamp because that
   * store has no timestamp — and since ABA-519 the flag is truthful again: it
   * is no longer set after a failed fetch.
   */
  categoriesReady: boolean;
  /**
   * Whether the initial-loader bound has elapsed. Owned by the caller (a
   * timer), so this stays a pure function of its inputs.
   */
  initialWaitElapsed: boolean;
}

export interface DashboardReadiness {
  /** Both transaction pulls have answered. Gates every spend/income figure. */
  transactions: boolean;
  wallet: boolean;
  budgets: boolean;
  categories: boolean;
  /**
   * Draw one centred loader instead of the dashboard.
   *
   * Only when **nothing** has answered yet — a partial state must NOT be
   * replaced by a full-screen spinner, because that would hide figures which
   * are already correct. Once anything has landed, the per-domain flags above
   * carry the honesty and the page renders.
   *
   * Bounded: after `initialWaitElapsed` the dashboard renders regardless, so a
   * dead network can never leave a spinner up for ever. The dashes then say
   * what is still unknown.
   */
  showInitialLoader: boolean;
}

export function resolveDashboardReadiness({
  isWeb,
  expensesPullAt,
  incomesPullAt,
  walletPullAt,
  budgetsPullAt,
  categoriesReady,
  initialWaitElapsed,
}: DashboardReadinessInputs): DashboardReadiness {
  if (!isWeb) {
    return {
      transactions: true,
      wallet: true,
      budgets: true,
      categories: true,
      showInitialLoader: false,
    };
  }

  // `null`, never falsy: a pull that legitimately landed on the epoch-adjacent
  // tick must not read as absent (the same trap `resolveWebFirstRun` names).
  const transactions = expensesPullAt !== null && incomesPullAt !== null;
  const wallet = walletPullAt !== null;
  const budgets = budgetsPullAt !== null;

  const nothingAnswered = !transactions && !wallet && !budgets && !categoriesReady;

  return {
    transactions,
    wallet,
    budgets,
    categories: categoriesReady,
    showInitialLoader: nothingAnswered && !initialWaitElapsed,
  };
}

export interface DashboardRefreshingInputs {
  /** `useHydrationStore.isHydrating` — the expense+income pull cycle. */
  isHydrating: boolean;
  walletLoading: boolean;
  budgetsLoading: boolean;
  categoriesLoading: boolean;
}

/**
 * Whether to show the thin top progress bar.
 *
 * Driven by **in-flight** flags, never by "has not answered yet". That
 * distinction is the whole correctness of this function: an offline native
 * client has `lastPullAt === null` for ever, and a bar keyed on that would
 * animate for ever on a device that is simply offline with a complete local
 * mirror. `isLoading`/`isHydrating` are true only while a request is actually
 * running, so this settles on its own on every platform.
 *
 * Before this the bar tracked `isHydrating` alone — expenses and incomes — so
 * a dashboard busy fetching its wallet, budgets and categories showed no
 * activity at all.
 */
export function isDashboardRefreshing({
  isHydrating,
  walletLoading,
  budgetsLoading,
  categoriesLoading,
}: DashboardRefreshingInputs): boolean {
  return isHydrating || walletLoading || budgetsLoading || categoriesLoading;
}
