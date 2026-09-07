import type { Budget, BudgetProgress, Currency } from '@budget/shared-types';
import { resolveBudgetProjection, type BudgetProjection } from './budgetProjection';

/**
 * The second line on the dashboard's Monthly Budget card
 * (`docs/design/2026-09-05-dashboard-web.md`'s "The budget projection line").
 *
 * `resolveBudgetProjection` already answers "is THIS budget heading over, and
 * what is the one sentence for it". The only question left is WHICH budget the
 * card is entitled to speak for — and that is the part that can be silently
 * wrong, which is why it lives here with tests rather than as a `.find()`
 * inside a component nothing in this repo's CI renders.
 *
 * ## Exactly one active monthly budget, or nothing
 *
 * The card's own headline figures come from
 * `budgetStore.getMonthlyBudgetSummary()`, which BLENDS every active monthly
 * budget into one pair of numbers. So with two budgets the card reads "620 of
 * 900" while a projection sentence naming a single budget would say "you reach
 * 500 on the 24th" — a limit that appears nowhere else on the card, sitting
 * directly beneath a bar drawn against 900. That is a wrong number, and the
 * design's own rule for the segmented bar one line above ("a bar that invents
 * a split across merged budgets would be a wrong number... worse than no bar")
 * applies unchanged.
 *
 * This mirrors `resolveMonthlyBudgetSegments`'s filter deliberately, with ONE
 * difference: it does **not** require category allocations. An "overall"
 * monthly budget has nothing to segment — hence that util's `hasOverall`
 * bail-out — but it projects perfectly well, and it is the commonest shape of
 * budget in the app. Refusing to warn a user with a single overall budget that
 * they are heading past it would remove the line from exactly the account it
 * helps most.
 *
 * ## Currency travels with the projection
 *
 * `BudgetProjection.amount` is in the BUDGET's currency, which need not be the
 * card's display currency (`ctx.currency`) — an account can hold a EUR budget
 * while displaying PLN. Returning the two together means the render site
 * cannot pair the figure with the wrong symbol, which is the same class of
 * defect ABA-386/387 fixed on the API side by refusing to infer a report's
 * currency from a row.
 */
export interface MonthlyBudgetProjection {
  projection: BudgetProjection;
  currencyCode: Currency;
}

export function resolveMonthlyBudgetProjection(
  budgets: Budget[],
  getBudgetProgress: (budgetId: string) => BudgetProgress | null,
): MonthlyBudgetProjection | null {
  const activeMonthly = budgets.filter(
    (b) => b.isActive && !b.isDeleted && b.period === 'monthly',
  );
  if (activeMonthly.length !== 1) return null;

  const [budget] = activeMonthly;
  const projection = resolveBudgetProjection(budget, getBudgetProgress(budget.id));
  if (!projection) return null;

  return { projection, currencyCode: budget.currencyCode };
}
