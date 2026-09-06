import type { ChartDataPoint } from '@budget/shared-types';

/**
 * The net-profit trend series, and the count that decides whether drawing it
 * is honest.
 *
 * Pure, and importing nothing but a type — currency conversion and month-label
 * formatting arrive as callbacks so this module can be tested without the
 * exchange-rate store or a locale. Nothing renders a component in this repo's
 * CI, so every rule here that could be quietly wrong lives in this file rather
 * than in `NetProfitWidget`, which keeps only layout.
 *
 * The bucketing below is a verbatim move of the loop that has always lived in
 * `NetProfitWidget` — same month boundaries, same filters, same reducers, same
 * `label`/`value` — so the series the phone draws is computed by the same code
 * it was before, not by a re-derivation of it. The ONLY thing added is
 * `populatedMonths`, taken from the same pass.
 */

/** Below this many populated months, a trend chart claims more than it knows. */
export const NET_PROFIT_MIN_POPULATED_MONTHS = 2;

/**
 * The one line of copy drawn in the chart's place below the threshold.
 *
 * REUSED, not invented: this task may not add an i18n key, and of the strings
 * that already exist in all nine locales this is the only one that says "not
 * enough data" without naming a quantity. The alternatives all assert
 * something untrue here — `wallet.noHistoryYet` says *balance* trend,
 * `analytics.noData` says *expense* data, `drillDown.noDataAvailable` says
 * there is none when there is one month of it.
 *
 * Declared here, beside the rule that creates the absence, so the widget and
 * the locale test cannot hold different opinions about which key is used —
 * a hardcoded string in the JSX would be invisible to any test in this repo,
 * since nothing renders a component in CI.
 *
 * It reaches across into the `healthScore` namespace, which is a real
 * maintenance hazard: someone rewording that card's copy would silently
 * reword this. A dedicated key is the right answer and is the product
 * owner's call — see the task report.
 */
export const NET_PROFIT_SPARSE_HINT_KEY = 'healthScore.notEnoughData';

/** The shape this module needs from an `Expense` or an `Income`. */
export interface NetProfitRow {
  date: string | Date;
  amount: number;
  currencyCode: string;
  isDeleted?: boolean;
}

export interface NetProfitSeriesInputs {
  /** How many calendar months the selected range covers (3 / 6 / 12). */
  monthCount: number;
  /** Injected rather than read from the clock, so the buckets are testable. */
  now: Date;
  incomes: NetProfitRow[];
  /** Already `filterConsumption`-ed by the caller — split receivables are not spend. */
  expenses: NetProfitRow[];
  /** Into the display currency. */
  convert: (amount: number, currencyCode: string) => number;
  formatLabel: (monthStart: Date) => string;
}

export interface NetProfitSeries {
  points: ChartDataPoint[];
  /** The newest month's net, or `null` when the range is empty. */
  currentNetProfit: number | null;
  /**
   * How many months in the range hold at least one transaction.
   *
   * **Counted by PRESENCE of a transaction, never by a non-zero net.** A month
   * with 500 in and 500 out is a real, populated month whose net is genuinely
   * zero; counting by net would hide the trend from a break-even user, who is
   * precisely the person a net-profit chart is for. The two counts are one
   * line apart and the wrong one looks correct, which is why it is stated
   * here and pinned by a test.
   */
  populatedMonths: number;
}

export function buildNetProfitSeries({
  monthCount,
  now,
  incomes,
  expenses,
  convert,
  formatLabel,
}: NetProfitSeriesInputs): NetProfitSeries {
  let populatedMonths = 0;

  const points: ChartDataPoint[] = Array.from({ length: monthCount }, (_, i) => {
    const offset = monthCount - 1 - i;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    const label = formatLabel(start);

    const monthIncomes = incomes.filter((inc) => {
      if (inc.isDeleted) return false;
      const dt = new Date(inc.date);
      return dt >= start && dt <= end;
    });
    const monthIncome = monthIncomes.reduce(
      (sum, inc) => sum + convert(inc.amount, inc.currencyCode),
      0,
    );

    const monthExpenses = expenses.filter((exp) => {
      if (exp.isDeleted) return false;
      const dt = new Date(exp.date);
      return dt >= start && dt <= end;
    });
    const monthExpense = monthExpenses.reduce(
      (sum, exp) => sum + convert(exp.amount, exp.currencyCode),
      0,
    );

    // Presence, not net — see `populatedMonths` above. Deleted rows and rows
    // outside the bucket are already gone: this reads the SAME filtered lists
    // the sums are built from, so the count can never disagree with the data
    // actually drawn.
    if (monthIncomes.length > 0 || monthExpenses.length > 0) populatedMonths += 1;

    return { label, value: monthIncome - monthExpense };
  });

  return {
    points,
    currentNetProfit: points[points.length - 1]?.value ?? null,
    populatedMonths,
  };
}

/**
 * Whether a trend chart over this many populated months says something true.
 *
 * A trend chart exists to compare periods. With one populated month there is
 * nothing to compare, and the other five months are not flat — they are
 * *absent*. Drawing them makes a confident false claim ("your net profit has
 * been level since April"), which is the same error as reporting a server zero
 * as a Safe-to-Spend figure. Refusing to draw is consistency with that, not a
 * second rule.
 */
export function hasEnoughMonthsForTrend(populatedMonths: number): boolean {
  return populatedMonths >= NET_PROFIT_MIN_POPULATED_MONTHS;
}
