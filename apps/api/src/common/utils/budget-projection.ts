/**
 * How much a budget period will end up costing, projected from the days so far.
 *
 * ## The defect this replaces
 *
 * Both copies of the old arithmetic (`budgets.service.ts` and the mobile
 * `budgetStore`) were `spent / daysElapsed * totalDays` — the mean daily spend,
 * extrapolated. That treats every payment as a habit, so one lumpy charge is
 * re-spent for the rest of the month.
 *
 * Measured on the account that prompted this: an 8000 PLN monthly budget, 22
 * expenses totalling 5938,73 by 9 September, of which the rent — "Mieszkanie",
 * 4350 PLN, paid once on the 8th — was **73% of the month's spend in a single
 * transaction**. The old formula divided it across 9 days and multiplied by 30,
 * i.e. charged the user rent three times, and reported "projected to exceed by
 * 10 383 zl". Excluding that one day from the RATE (while still counting its
 * money as spent) gives a projected total near 10 100 and an overage near 2 100
 * — which is defensible: rent really does eat 4350 of the 8000, so the sign was
 * right all along and only the magnitude was fiction.
 *
 * ## Why "mean excluding the largest day" rather than a median
 *
 * A median is more robust to SEVERAL lumps, but it collapses to zero as soon as
 * spending happens on fewer than half the elapsed days — and a projection of
 * "exactly what you have spent so far" would silently withdraw the warning from
 * the user who spends in a few big bursts. Dropping the single largest day
 * targets the reported problem precisely, never collapses while any spending
 * exists, and is one sentence to explain to a user.
 *
 * ## Why days with no spending must be counted
 *
 * `dailyTotals` carries only the days that had expenses, because that is what a
 * `groupBy(date)` returns. Averaging over those alone would report the rate of a
 * spending DAY rather than of the period, inflating every projection. The
 * padding happens here, inside the shared function, so the two call sites
 * cannot disagree about it.
 *
 * ## Duplicated deliberately
 *
 * Canonical copy here; mirror at
 * `packages/shared-utils/src/formatting/budget-projection.ts`, which is what the
 * mobile store imports. Same convention and same reason as `financial-month.ts`
 * and `wallet-currencies.ts`: the API has no build step and must not import
 * `@budget/shared-utils` at runtime (see the `check-no-shared-utils-runtime-
 * import.sh` deploy guard). Change one, change the other.
 */

/**
 * Below this many elapsed days the period has no rate worth extrapolating —
 * dropping the largest day out of two or three leaves almost no signal, and a
 * confident sentence built on it is the class of claim ABA-521 removed from the
 * dashboard. `projectedTotal` is `null` there and every consumer already treats
 * a missing projection as "say nothing".
 */
export const MIN_DAYS_FOR_BUDGET_PROJECTION = 5;

export interface BudgetProjectionInputs {
  /** Total already spent in the period. Counted in full, lump payments included. */
  spent: number;
  /**
   * One total per day that had spending, in any order. Days with none are
   * absent and are padded in here — see the note above.
   */
  dailyTotals: number[];
  /** Whole days elapsed in the period, including today. Clamped to >= 1 by callers. */
  daysElapsed: number;
  /** Whole days in the period. */
  totalDays: number;
}

export interface BudgetProjectionEstimate {
  /**
   * Best estimate of the period's final spend, or `null` when there is not
   * enough of the period behind us to say. Never below `spent`: the rate cannot
   * be negative, and money already gone does not come back.
   */
  projectedTotal: number | null;
  /**
   * The daily rate the projection used, or `null` alongside a `null` total.
   * Exposed because the exhaustion date is derived from it and the two must
   * agree — a date computed from a different rate than the total is how one
   * card ends up contradicting itself.
   */
  dailyRate: number | null;
}

export function projectBudgetSpend({
  spent,
  dailyTotals,
  daysElapsed,
  totalDays,
}: BudgetProjectionInputs): BudgetProjectionEstimate {
  const elapsed = Math.max(0, Math.floor(daysElapsed));
  if (elapsed < MIN_DAYS_FOR_BUDGET_PROJECTION) {
    return { projectedTotal: null, dailyRate: null };
  }

  // Pad to the elapsed day count: a day without spending is a real observation
  // of a zero, not a missing one.
  const days = dailyTotals.filter((n) => Number.isFinite(n) && n > 0).slice(0, elapsed);
  const padded = [...days, ...Array(Math.max(0, elapsed - days.length)).fill(0)];

  // Drop the single largest day from the RATE only. Its money stays in `spent`.
  const largest = padded.reduce((max, n) => (n > max ? n : max), 0);
  const withoutLargest = padded.length > 1 ? sum(padded) - largest : sum(padded);
  const rateDays = padded.length > 1 ? padded.length - 1 : 1;
  const dailyRate = rateDays > 0 ? withoutLargest / rateDays : 0;

  const daysRemaining = Math.max(0, Math.floor(totalDays) - elapsed);

  return {
    projectedTotal: spent + dailyRate * daysRemaining,
    dailyRate,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, n) => total + n, 0);
}
