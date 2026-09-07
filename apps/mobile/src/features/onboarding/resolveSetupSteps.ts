/**
 * The setup checklist's three steps, and what marks each one done.
 *
 * Pure, so the rule is testable without a store, a navigator or a renderer —
 * mirroring `resolveWebFirstRun` and `shouldShowFirstRun` beside it. Nothing
 * renders a component in this repo's CI, so anything here that could be
 * numerically or textually wrong lives in this file rather than in the
 * component, which is left with layout only.
 *
 * The whole table — order, done-rule, destination, and which existing i18n
 * key labels each row — lives in ONE place on purpose. A component holding
 * its own id -> key map would be a second source of truth about the same
 * three rows, and the two would drift the first time a step is added.
 */

/** Stable ids, so a caller can special-case a row without matching on text. */
export type SetupStepId = 'transaction' | 'wallet' | 'budget';

export interface SetupStep {
  id: SetupStepId;
  /** Live tick — derived from data the dashboard has already loaded. */
  done: boolean;
  /** i18n key for the row's label. Every key here already exists in all 9 locales. */
  titleKey: string;
  /** i18n key for the row's one-line reason. Same. */
  hintKey: string;
  /** Where tapping the row goes. */
  route: string;
}

export interface SetupStepsInputs {
  /** `expenseStore.expenses.length`. */
  expenseCount: number;
  /** `incomeStore.incomes.length`. */
  incomeCount: number;
  /**
   * `walletSummary.length` — one entry per currency the account holds.
   * This is exactly the condition that makes Safe to Spend, Net Capital and
   * Wallets stop saying nothing, and the honest fix for the 0,00 reading.
   */
  walletCurrencyCount: number;
  /**
   * The count of ALL active budgets on the account (`isActive && !isDeleted`),
   * NOT `monthlyBudgetSummary.budgetCount`, which filters `period ===
   * 'monthly'`. The row's label is `budgets.createBudget` ("Create Budget"),
   * which says nothing about a period — so counting monthly-only told a user
   * whose single budget is weekly or yearly to do something they had already
   * done, on a row they could never tick. The set counted here is exactly the
   * set `useFinancialHealthScore` counts for its own budget-adherence
   * component, which is the component this step exists to unblock.
   */
  budgetCount: number;
}

/**
 * The three steps, always all three, always in this order, each carrying its
 * own live `done`.
 *
 * Returning every step rather than only the outstanding ones is what makes
 * the card a checklist instead of a nag: a user who has done two of three
 * sees two ticks, which is the difference between progress and a chore.
 * Deciding whether to render the card at all is `isSetupComplete`'s job.
 */
export function resolveSetupSteps({
  expenseCount,
  incomeCount,
  walletCurrencyCount,
  budgetCount,
}: SetupStepsInputs): SetupStep[] {
  return [
    {
      id: 'transaction',
      // EITHER kind of transaction satisfies this. A user who logged a salary
      // and no expense has activated the app just as much as one who did the
      // reverse, and telling them otherwise is the checklist calling them a
      // beginner while their data says otherwise.
      done: expenseCount + incomeCount > 0,
      titleKey: 'dashboard.addExpense',
      hintKey: 'dashboard.addFirstExpense',
      // The spec's destination for this row is "any of the four cards", which
      // exists only in the first-run state — beside the focus column's own
      // 2x2 grid. Once first-run ends the row still has to go somewhere, and
      // the manual form is the one entry path that is always available (no
      // camera, no microphone, no file). See the report's note on this.
      route: '/expense/new',
    },
    {
      id: 'wallet',
      done: walletCurrencyCount > 0,
      titleKey: 'wallet.addBalance',
      hintKey: 'wallet.noBalancesHint',
      route: '/wallet/set-balance',
    },
    {
      id: 'budget',
      done: budgetCount > 0,
      titleKey: 'budgets.createBudget',
      hintKey: 'budgets.createHint',
      route: '/budget/new',
    },
  ];
}

/**
 * Whether the card has nothing left to say and should disappear on its own.
 *
 * `every`, not `some`: the card stays while ANY step is outstanding. This is
 * the rule that covers the real hole the checklist exists to plug — a user who
 * adds one expense and never sets a wallet balance is exactly the user whose
 * Safe to Spend reads 0,00 forever, and after onboarding nothing else would
 * tell them why.
 */
export function isSetupComplete(steps: SetupStep[]): boolean {
  return steps.every((step) => step.done);
}

export interface SetupChecklistVisibilityInputs {
  /**
   * True only for the ORDINARY dashboard. The first-run rail renders the card
   * unconditionally — in that state every step is outstanding by definition —
   * so this predicate speaks only for the rail that has to decide.
   */
  isDashboardView: boolean;
  /**
   * Every row navigates to a write screen a viewer is blocked from
   * server-side, so for a viewer the card is a list of three things they
   * cannot do.
   */
  canEdit: boolean;
  /** Both transaction pulls answered — `hasPullAnswered`. */
  transactionPullAnswered: boolean;
  /**
   * `walletStore.lastPullAt !== null`.
   *
   * The wallet row's tick is `walletSummary.length > 0`, and on web every
   * local read returns empty until the server answers — so without this a
   * fully-configured user watched "Set your wallet balance" appear and then
   * vanish, the card telling them to do something already done. Exactly the
   * same reason `transactionPullAnswered` above is a condition, applied to the
   * third source the card reads from.
   */
  walletPullAnswered: boolean;
  /** `firstRunStore.checklistDismissed`. */
  dismissed: boolean;
  /** All three steps from `resolveSetupSteps`, never a pre-filtered list. */
  steps: SetupStep[];
}

/**
 * Whether the ORDINARY rail draws the checklist.
 *
 * Pure so the rule is pinned by tests rather than living as a five-term `&&`
 * inside a component nothing in this repo's CI can render.
 *
 * Every condition is a reason to stay silent, and silence is the safe answer
 * for all of them: a card derived from readings nobody has confirmed is the
 * app asserting a fact it does not have, which is the whole class of bug this
 * change belongs to.
 */
export function shouldShowSetupChecklist({
  isDashboardView,
  canEdit,
  transactionPullAnswered,
  walletPullAnswered,
  dismissed,
  steps,
}: SetupChecklistVisibilityInputs): boolean {
  if (!isDashboardView || !canEdit || dismissed) return false;
  // Both, not either: the card reads counts from all three sources and a
  // single unanswered one is enough to make a row wrong.
  if (!transactionPullAnswered || !walletPullAnswered) return false;
  return !isSetupComplete(steps);
}
