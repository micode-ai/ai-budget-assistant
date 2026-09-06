import type { ChartDataPoint } from '@budget/shared-types';

/**
 * The net-profit trend series, and the TWO counts that decide what the hero
 * draws.
 *
 * Pure, and importing nothing but a type — currency conversion and month-label
 * formatting arrive as callbacks so this module can be tested without the
 * exchange-rate store or a locale. Nothing renders a component in this repo's
 * CI, so every rule here that could be quietly wrong lives in this file rather
 * than in NetProfitWidget, which keeps only layout.
 *
 * The bucketing is a verbatim move of the loop that has always lived in
 * NetProfitWidget — same month boundaries, same filters, same reducers, same
 * label/value — so the series the phone draws is computed by the same code it
 * was before, not by a re-derivation of it.
 *
 * ## Two questions, two inputs, and they must never share a boolean
 *
 * - "Is THIS RANGE worth drawing?" is shouldRenderTrendChart, fed the
 *   populated-month count of the SELECTED range.
 * - "Is there anything to range OVER at all?" is shouldRenderRangeChips, fed
 *   the populated-month count of the WIDEST range the control can select.
 *
 * Deriving the second from the first is the trap this module exists to make
 * impossible. If the chips are hidden whenever the chart is, then a user who
 * narrows to 3M on a sparse stretch loses the chart AND the only control that
 * would widen it back: a dashboard whose chart vanished with nothing to press.
 * It technically recovers on a remount, which is not a way out a person can
 * find. The two predicates therefore take differently-named inputs, so passing
 * the wrong count is a visible mistake at the call site rather than a silent
 * one.
 */

/** Below this many populated months, a trend chart claims more than it knows. */
export const NET_PROFIT_MIN_POPULATED_MONTHS = 2;

/**
 * The one line of copy drawn in the chart's place below the threshold.
 *
 * REUSED, not invented: this task may not add an i18n key, and of the strings
 * that already exist in all nine locales this is the only one that says "not
 * enough data" without naming a quantity. The alternatives all assert
 * something untrue here — wallet.noHistoryYet says *balance* trend,
 * analytics.noData says *expense* data, drillDown.noDataAvailable says there
 * is none when there is one month of it.
 *
 * Declared here, beside the rule that creates the absence, so the widget and
 * the locale test cannot hold different opinions about which key is used —
 * a hardcoded string in the JSX would be invisible to any test in this repo,
 * since nothing renders a component in CI.
 *
 * It reaches across into the healthScore namespace, which is a real
 * maintenance hazard: someone rewording that card's copy would silently
 * reword this. A dedicated key is the right answer and is the product
 * owner's call — see the task report.
 */
export const NET_PROFIT_SPARSE_HINT_KEY = 'healthScore.notEnoughData';

/** The shape this module needs from an Expense or an Income. */
export interface NetProfitRow {
  date: string | Date;
  amount: number;
  currencyCode: string;
  isDeleted?: boolean;
}

/** One calendar month's inclusive bounds. */
interface MonthBucket {
  start: Date;
  end: Date;
}

/**
 * The month boundaries, oldest first, ending on the month containing now.
 *
 * The SINGLE bucketing implementation in this module. Both the series and the
 * standalone counter read it, so the count can never disagree with the data
 * drawn beside it — a second copy of this arithmetic is exactly how a chart
 * and its own "is it worth drawing" verdict drift apart.
 */
function monthBuckets(now: Date, monthCount: number): MonthBucket[] {
  return Array.from({ length: monthCount }, (_, i) => {
    const offset = monthCount - 1 - i;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    // Without this, end is midnight on the last day and every transaction
    // made during that day falls out of its own month.
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });
}

/** The live rows of a list that fall inside one bucket. */
function rowsInMonth(rows: NetProfitRow[], { start, end }: MonthBucket): NetProfitRow[] {
  return rows.filter((row) => {
    if (row.isDeleted) return false;
    const dt = new Date(row.date);
    return dt >= start && dt <= end;
  });
}

export interface PopulatedMonthsInputs {
  /** How many calendar months the window covers. */
  monthCount: number;
  /** Injected rather than read from the clock, so the buckets are testable. */
  now: Date;
  incomes: NetProfitRow[];
  expenses: NetProfitRow[];
}

/**
 * How many months in a window hold at least one transaction.
 *
 * **Counted by PRESENCE of a transaction, never by a non-zero net.** A month
 * with 500 in and 500 out is a real, populated month whose net is genuinely
 * zero; counting by net would hide the trend from a break-even user, who is
 * precisely the person a net-profit chart is for. The two counts are one line
 * apart and the wrong one looks correct, which is why it is stated here and
 * pinned by a test.
 */
export function countPopulatedMonthsInWindow({
  monthCount,
  now,
  incomes,
  expenses,
}: PopulatedMonthsInputs): number {
  return monthBuckets(now, monthCount).filter(
    (bucket) => rowsInMonth(incomes, bucket).length > 0 || rowsInMonth(expenses, bucket).length > 0,
  ).length;
}

export interface NetProfitSeriesInputs extends PopulatedMonthsInputs {
  /** Into the display currency. */
  convert: (amount: number, currencyCode: string) => number;
  formatLabel: (monthStart: Date) => string;
}

export interface NetProfitSeries {
  points: ChartDataPoint[];
  /** The newest month's net, or null when the range is empty. */
  currentNetProfit: number | null;
  /**
   * Populated months WITHIN THE SELECTED RANGE — the chart's own input, and
   * deliberately named so it cannot be mistaken at the call site for the
   * whole-history count the range chips are decided by.
   */
  populatedMonthsInRange: number;
}

export function buildNetProfitSeries({
  monthCount,
  now,
  incomes,
  expenses,
  convert,
  formatLabel,
}: NetProfitSeriesInputs): NetProfitSeries {
  let populatedMonthsInRange = 0;

  const points: ChartDataPoint[] = monthBuckets(now, monthCount).map((bucket) => {
    const label = formatLabel(bucket.start);

    const monthIncomes = rowsInMonth(incomes, bucket);
    const monthIncome = monthIncomes.reduce(
      (sum, inc) => sum + convert(inc.amount, inc.currencyCode),
      0,
    );

    const monthExpenses = rowsInMonth(expenses, bucket);
    const monthExpense = monthExpenses.reduce(
      (sum, exp) => sum + convert(exp.amount, exp.currencyCode),
      0,
    );

    // Presence, not net. Reads the SAME filtered lists the sums are built
    // from, so the count can never disagree with the data actually drawn.
    if (monthIncomes.length > 0 || monthExpenses.length > 0) populatedMonthsInRange += 1;

    return { label, value: monthIncome - monthExpense };
  });

  return {
    points,
    currentNetProfit: points[points.length - 1]?.value ?? null,
    populatedMonthsInRange,
  };
}

/**
 * Is the SELECTED RANGE worth drawing?
 *
 * A trend chart exists to compare periods. With one populated month there is
 * nothing to compare, and the other months are not flat — they are absent.
 * Drawing them makes a confident false claim ("your net profit has been level
 * since April"), which is the same error as reporting a server zero as a
 * Safe-to-Spend figure. Refusing to draw is consistency with that, not a
 * second rule.
 *
 * Answers ONLY this question. It says nothing about whether the range control
 * should be on screen — see shouldRenderRangeChips, and do not feed this
 * function's result to it.
 */
export function shouldRenderTrendChart({
  populatedMonthsInRange,
}: {
  populatedMonthsInRange: number;
}): boolean {
  return populatedMonthsInRange >= NET_PROFIT_MIN_POPULATED_MONTHS;
}

/**
 * Is there anything to range OVER at all?
 *
 * Fed the populated-month count of the WIDEST window the control can select,
 * never the selected one. A control that changes what is shown has to stay
 * reachable while there is anything for it to reveal: hiding it in a sparse
 * range strands the user at that range with no way to widen it.
 *
 * The count is bounded by the widest selectable window rather than by literally
 * all history, so the promise this makes is exact: if the chips are shown, at
 * least one of their settings draws a chart. An account whose only activity
 * predates the widest window gets no chips — otherwise they would offer three
 * views of the same absence, which is the very thing the no-data case exists
 * to prevent.
 */
export function shouldRenderRangeChips({
  populatedMonthsInHistory,
}: {
  populatedMonthsInHistory: number;
}): boolean {
  return populatedMonthsInHistory >= NET_PROFIT_MIN_POPULATED_MONTHS;
}
