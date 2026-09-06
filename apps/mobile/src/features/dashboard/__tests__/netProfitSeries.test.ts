import {
  buildNetProfitSeries,
  hasEnoughMonthsForTrend,
  NET_PROFIT_MIN_POPULATED_MONTHS,
  type NetProfitRow,
  type NetProfitSeriesInputs,
} from '../netProfitSeries';

/**
 * The net-profit series and the rule that decides whether drawing it is
 * honest.
 *
 * Every test below names the single production change that would make it
 * fail. A test that cannot be broken by a named one-line edit pins nothing —
 * this project has shipped one that passed against a deliberately broken
 * implementation — so if a case here has no such note, delete it.
 */

/** September 2026, so the six-month window is Apr..Sep. Local time, matching
 *  the `new Date(y, m, d)` buckets the production code builds. */
const NOW = new Date(2026, 8, 15);

function row(date: Date, amount: number, over: Partial<NetProfitRow> = {}): NetProfitRow {
  return { date, amount, currencyCode: 'PLN', ...over };
}

function series(over: Partial<NetProfitSeriesInputs> = {}) {
  return buildNetProfitSeries({
    monthCount: 6,
    now: NOW,
    incomes: [],
    expenses: [],
    // Identity by default — conversion is exercised on its own below.
    convert: (amount) => amount,
    formatLabel: (start) => `${start.getFullYear()}-${start.getMonth() + 1}`,
    ...over,
  });
}

describe('buildNetProfitSeries — the series itself', () => {
  it('returns one point per month, oldest first, ending on the current month', () => {
    // Breaks if: `offset` stops being `monthCount - 1 - i` (e.g. becomes `i`),
    // which reverses the series. The chart would then read right-to-left and
    // `currentNetProfit` would report the OLDEST month as today's figure.
    const { points } = series();
    expect(points.map((p) => p.label)).toEqual([
      '2026-4',
      '2026-5',
      '2026-6',
      '2026-7',
      '2026-8',
      '2026-9',
    ]);
  });

  it('nets income against expense per month', () => {
    // Breaks if: the subtraction is flipped to `monthExpense - monthIncome`,
    // or either side is dropped from the returned `value`.
    const { points } = series({
      incomes: [row(new Date(2026, 8, 3), 900)],
      expenses: [row(new Date(2026, 8, 4), 250)],
    });
    expect(points[5].value).toBe(650);
  });

  it('reports the NEWEST month as currentNetProfit, not the oldest', () => {
    // Breaks if: `points[points.length - 1]` becomes `points[0]`. Both are
    // real numbers, so nothing else here would notice.
    const { currentNetProfit } = series({
      incomes: [row(new Date(2026, 3, 10), 1000), row(new Date(2026, 8, 10), 7)],
    });
    expect(currentNetProfit).toBe(7);
  });

  it('has no current figure when the range holds no months at all', () => {
    // Breaks if: the `?? null` fallback is dropped, making this `undefined` —
    // which the widget renders as a missing headline rather than hiding it,
    // because it tests `currentNetProfit !== null`.
    const { points, currentNetProfit, populatedMonths } = series({ monthCount: 0 });
    expect(points).toEqual([]);
    expect(currentNetProfit).toBeNull();
    expect(populatedMonths).toBe(0);
  });

  it('converts both sides through the caller-supplied converter', () => {
    // Breaks if: either `convert` call is dropped and the raw `amount` used.
    // A EUR expense in a PLN account would then be subtracted at face value.
    const { points } = series({
      incomes: [row(new Date(2026, 8, 3), 100, { currencyCode: 'EUR' })],
      expenses: [row(new Date(2026, 8, 4), 100, { currencyCode: 'PLN' })],
      convert: (amount, currencyCode) => (currencyCode === 'EUR' ? amount * 4 : amount),
    });
    expect(points[5].value).toBe(300);
  });

  it('ignores rows outside the window and deleted rows', () => {
    // Breaks if: the `dt >= start && dt <= end` bucket filter is widened, or
    // the `isDeleted` guard is dropped from either filter. A deleted expense
    // still subtracting is money the user believes they no longer spent.
    const { points } = series({
      incomes: [
        row(new Date(2025, 8, 10), 5000), // a year earlier
        row(new Date(2026, 8, 10), 100, { isDeleted: true }),
      ],
      expenses: [row(new Date(2026, 8, 11), 40, { isDeleted: true })],
    });
    expect(points.every((p) => p.value === 0)).toBe(true);
  });

  it('includes a transaction at the last instant of the month', () => {
    // Breaks if: `end.setHours(23, 59, 59, 999)` is removed. `end` would then
    // be midnight on the last day and every transaction made during that day
    // would silently fall out of its own month.
    const { points } = series({
      incomes: [row(new Date(2026, 8, 30, 23, 59, 59, 999), 12)],
    });
    expect(points[5].value).toBe(12);
  });
});

describe('buildNetProfitSeries — populatedMonths', () => {
  it('counts a break-even month, whose net is genuinely zero', () => {
    // Breaks if: the count is taken from the NET rather than from the
    // presence of a transaction — i.e. `if (monthIncome - monthExpense !== 0)`
    // or `if (value !== 0)`. This is the spec's named trap: the two counts are
    // one line apart, the wrong one looks correct, and it would hide the trend
    // from a break-even user, who is exactly who a net-profit chart is for.
    // Every other assertion in this file passes under that mutation.
    const { points, populatedMonths } = series({
      incomes: [row(new Date(2026, 7, 3), 500), row(new Date(2026, 8, 3), 500)],
      expenses: [row(new Date(2026, 7, 4), 500), row(new Date(2026, 8, 4), 500)],
    });
    expect(points[4].value).toBe(0);
    expect(points[5].value).toBe(0);
    expect(populatedMonths).toBe(2);
  });

  it('does not count a month with nothing in it', () => {
    // Breaks if: the guard becomes unconditional (`populatedMonths += 1` with
    // no `if`), which would report every rendered month as populated and make
    // the threshold below unreachable — the chart would always draw.
    expect(series().populatedMonths).toBe(0);
  });

  it('counts a month holding only an expense, and one holding only an income', () => {
    // Breaks if: either operand is dropped from
    // `monthIncomes.length > 0 || monthExpenses.length > 0`, or the `||`
    // becomes `&&` (which would need BOTH kinds in the same month).
    const { populatedMonths } = series({
      incomes: [row(new Date(2026, 6, 2), 10)],
      expenses: [row(new Date(2026, 7, 2), 10)],
    });
    expect(populatedMonths).toBe(2);
  });

  it('counts a month once however many transactions it holds', () => {
    // Breaks if: the counter is incremented per ROW rather than per month
    // (e.g. `populatedMonths += monthIncomes.length + monthExpenses.length`),
    // which would clear the threshold on a single busy month — the very case
    // that has nothing to compare.
    const { populatedMonths } = series({
      expenses: [
        row(new Date(2026, 8, 1), 10),
        row(new Date(2026, 8, 2), 10),
        row(new Date(2026, 8, 3), 10),
      ],
    });
    expect(populatedMonths).toBe(1);
  });

  it('does not count a month whose only rows are deleted', () => {
    // Breaks if: the count is taken from the UNFILTERED lists rather than from
    // the same `monthIncomes`/`monthExpenses` the sums are built from — the
    // count and the drawn data would then disagree, which is the failure the
    // shared-filtered-list design exists to prevent.
    const { populatedMonths } = series({
      expenses: [row(new Date(2026, 8, 2), 10, { isDeleted: true })],
    });
    expect(populatedMonths).toBe(0);
  });

  it('reproduces the reported case: one real month inside a six-month window', () => {
    // Breaks if: any of the above regresses. This is the production reading
    // that prompted the rule — a new account with a single month of activity,
    // whose other five months were being drawn as a flat line at zero.
    const { points, populatedMonths } = series({
      expenses: [row(new Date(2026, 8, 5), 120)],
    });
    expect(points).toHaveLength(6);
    expect(populatedMonths).toBe(1);
    expect(hasEnoughMonthsForTrend(populatedMonths)).toBe(false);
  });
});

describe('hasEnoughMonthsForTrend', () => {
  it('needs two populated months, and two is enough', () => {
    // Breaks if: the threshold constant moves, or `>=` becomes `>` (which
    // would demand three and hide the chart from a user who has exactly the
    // two months a comparison needs), or `<` (which would draw everything).
    expect(hasEnoughMonthsForTrend(0)).toBe(false);
    expect(hasEnoughMonthsForTrend(1)).toBe(false);
    expect(hasEnoughMonthsForTrend(2)).toBe(true);
    expect(hasEnoughMonthsForTrend(3)).toBe(true);
  });

  it('is the exported constant, so the widget and this rule cannot disagree', () => {
    // Breaks if: the function stops reading NET_PROFIT_MIN_POPULATED_MONTHS
    // and hardcodes its own number. A second copy of a threshold is how the
    // chips and the chart end up disagreeing about whether to render.
    expect(NET_PROFIT_MIN_POPULATED_MONTHS).toBe(2);
    expect(hasEnoughMonthsForTrend(NET_PROFIT_MIN_POPULATED_MONTHS)).toBe(true);
    expect(hasEnoughMonthsForTrend(NET_PROFIT_MIN_POPULATED_MONTHS - 1)).toBe(false);
  });
});
