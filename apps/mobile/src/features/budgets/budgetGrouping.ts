import type { Budget, BudgetProgress } from '@budget/shared-types';

/**
 * Pure grouping/classification for the desktop budgets grid
 * (`docs/design/2026-09-05-budgets-web.md`'s "Card grid and grouping").
 * Mirrors `desktopTable.ts`'s `summarise`/`facetValue` and `periodNav.ts` —
 * logic worth unit-testing lives here, not inline in `BudgetsDesktop.tsx`,
 * since nothing in this repo renders a component in CI.
 *
 * `useBudgetsScreenData()` is read-only for this feature (its own
 * `visibleBudgets`/`getBudgetProgress` are unchanged) — this module only
 * derives a VIEW over what that hook already returns, one budget + its own
 * `getBudgetProgress(id)` (no `referenceDate` override — "this list always
 * shows now", per the design's "Why there is no period control") at a time.
 */

export const DEFAULT_ALERT_THRESHOLD = 80;

export type BudgetCardState = 'over' | 'nearing' | 'onTrack' | 'inactive';

export interface ClassifiedBudget {
  budget: Budget;
  progress: BudgetProgress | null;
  percentageUsed: number;
  state: BudgetCardState;
  /** Whether this budget belongs in the "Needs attention" group. */
  needsAttention: boolean;
}

/**
 * `isActive === false` always classifies as `inactive` — excluded from
 * "needs attention" regardless of its own numbers (design: "Everything
 * else, including any inactive budget regardless of its numbers, is 'on
 * track.'"). Otherwise: `over` when actually over budget, `nearing` when at
 * or above the budget's OWN `alertThreshold` (falling back to 80% when
 * unset — a deliberate divergence from mobile's hardcoded 80%, see the
 * design's Departures) OR the projected total already exceeds the amount
 * (catches a budget trending toward trouble before its current usage alone
 * would flag it), else `onTrack`.
 */
export function classifyBudget(budget: Budget, progress: BudgetProgress | null): ClassifiedBudget {
  const percentageUsed = progress?.percentageUsed ?? 0;

  if (!budget.isActive) {
    return { budget, progress, percentageUsed, state: 'inactive', needsAttention: false };
  }

  const isOverBudget = progress?.isOverBudget ?? false;
  if (isOverBudget) {
    return { budget, progress, percentageUsed, state: 'over', needsAttention: true };
  }

  const threshold = budget.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
  const projectedOver = !!progress && progress.projectedTotal > budget.amount;
  if (percentageUsed >= threshold || projectedOver) {
    return { budget, progress, percentageUsed, state: 'nearing', needsAttention: true };
  }

  return { budget, progress, percentageUsed, state: 'onTrack', needsAttention: false };
}

export interface BudgetGroups {
  needsAttention: ClassifiedBudget[];
  onTrack: ClassifiedBudget[];
}

const byPercentageUsedDesc = (a: ClassifiedBudget, b: ClassifiedBudget) => b.percentageUsed - a.percentageUsed;

/**
 * Splits into the two named groups and sorts each worst-first — except
 * inactive budgets, which always sort to the bottom of "On track" no matter
 * their own percentage (design: "with inactive budgets always sorted last
 * regardless of their number").
 */
export function groupBudgets(classified: ClassifiedBudget[]): BudgetGroups {
  const needsAttention = classified.filter((c) => c.needsAttention).sort(byPercentageUsedDesc);

  const onTrackActive = classified
    .filter((c) => !c.needsAttention && c.state !== 'inactive')
    .sort(byPercentageUsedDesc);
  const onTrackInactive = classified
    .filter((c) => c.state === 'inactive')
    .sort(byPercentageUsedDesc);

  return { needsAttention, onTrack: [...onTrackActive, ...onTrackInactive] };
}

/** A group's header is shown only when BOTH groups have at least one member
 *  — a header distinguishing a group from nothing is chrome with nothing to
 *  say (design's "Card grid and grouping"). */
export function shouldShowGroupHeaders(groups: BudgetGroups): boolean {
  return groups.needsAttention.length > 0 && groups.onTrack.length > 0;
}

/**
 * Count of individual category allocations, across all ACTIVE
 * multi-category budgets, whose own `categoryBreakdown` entry is
 * `isOverBudget` — independent of whether the parent budget's total is over
 * (design's "Summary strip", 4th tile). A budget with even one allocation
 * carries a `categoryBreakdown` (the model treats it as "multi-category"
 * internally regardless of allocation count — see `BudgetProgress`), so
 * this counts every over-allocated category, not just ones on a
 * multi-allocation budget.
 */
export function countCategoriesOverAllocation(classified: ClassifiedBudget[]): number {
  let count = 0;
  for (const c of classified) {
    if (c.state === 'inactive') continue;
    const breakdown = c.progress?.categoryBreakdown;
    if (!breakdown) continue;
    for (const cat of breakdown) {
      if (cat.isOverBudget) count++;
    }
  }
  return count;
}
