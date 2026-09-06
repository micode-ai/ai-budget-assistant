import {
  buildNetProfitSeries,
  countPopulatedMonthsInWindow,
  shouldRenderRangeChips,
  shouldRenderTrendChart,
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
    const { points, currentNetProfit, populatedMonthsInRange } = series({ monthCount: 0 });
    expect(points).toEqual([]);
    expect(currentNetProfit).toBeNull();
    expect(populatedMonthsInRange).toBe(0);
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

describe('buildNetProfitSeries — populatedMonthsInRange', () => {
  it('counts a break-even month, whose net is genuinely zero', () => {
    // Breaks if: the count is taken from the NET rather than from the
    // presence of a transaction — i.e. `if (monthIncome - monthExpense !== 0)`
    // or `if (value !== 0)`. This is the spec's named trap: the two counts are
    // one line apart, the wrong one looks correct, and it would hide the trend
    // from a break-even user, who is exactly who a net-profit chart is for.
    // Every other assertion in this file passes under that mutation.
    const { points, populatedMonthsInRange } = series({
      incomes: [row(new Date(2026, 7, 3), 500), row(new Date(2026, 8, 3), 500)],
      expenses: [row(new Date(2026, 7, 4), 500), row(new Date(2026, 8, 4), 500)],
    });
    expect(points[4].value).toBe(0);
    expect(points[5].value).toBe(0);
    expect(populatedMonthsInRange).toBe(2);
  });

  it('does not count a month with nothing in it', () => {
    // Breaks if: the guard becomes unconditional (`populatedMonthsInRange += 1` with
    // no `if`), which would report every rendered month as populated and make
    // the threshold below unreachable — the chart would always draw.
    expect(series().populatedMonthsInRange).toBe(0);
  });

  it('counts a month holding only an expense, and one holding only an income', () => {
    // Breaks if: either operand is dropped from
    // `monthIncomes.length > 0 || monthExpenses.length > 0`, or the `||`
    // becomes `&&` (which would need BOTH kinds in the same month).
    const { populatedMonthsInRange } = series({
      incomes: [row(new Date(2026, 6, 2), 10)],
      expenses: [row(new Date(2026, 7, 2), 10)],
    });
    expect(populatedMonthsInRange).toBe(2);
  });

  it('counts a month once however many transactions it holds', () => {
    // Breaks if: the counter is incremented per ROW rather than per month
    // (e.g. `populatedMonthsInRange += monthIncomes.length + monthExpenses.length`),
    // which would clear the threshold on a single busy month — the very case
    // that has nothing to compare.
    const { populatedMonthsInRange } = series({
      expenses: [
        row(new Date(2026, 8, 1), 10),
        row(new Date(2026, 8, 2), 10),
        row(new Date(2026, 8, 3), 10),
      ],
    });
    expect(populatedMonthsInRange).toBe(1);
  });

  it('does not count a month whose only rows are deleted', () => {
    // Breaks if: the count is taken from the UNFILTERED lists rather than from
    // the same `monthIncomes`/`monthExpenses` the sums are built from — the
    // count and the drawn data would then disagree, which is the failure the
    // shared-filtered-list design exists to prevent.
    const { populatedMonthsInRange } = series({
      expenses: [row(new Date(2026, 8, 2), 10, { isDeleted: true })],
    });
    expect(populatedMonthsInRange).toBe(0);
  });

  it('reproduces the reported case: one real month inside a six-month window', () => {
    // Breaks if: any of the above regresses. This is the production reading
    // that prompted the rule — a new account with a single month of activity,
    // whose other five months were being drawn as a flat line at zero.
    const { points, populatedMonthsInRange } = series({
      expenses: [row(new Date(2026, 8, 5), 120)],
    });
    expect(points).toHaveLength(6);
    expect(populatedMonthsInRange).toBe(1);
    expect(shouldRenderTrendChart({ populatedMonthsInRange })).toBe(false);
  });
});

describe('countPopulatedMonthsInWindow', () => {
  const window12 = (over: Partial<Parameters<typeof countPopulatedMonthsInWindow>[0]> = {}) =>
    countPopulatedMonthsInWindow({ monthCount: 12, now: NOW, incomes: [], expenses: [], ...over });

  it('counts months across the whole window, not only the recent ones', () => {
    // Breaks if: this function is passed the SELECTED month count instead of
    // the widest one at the call site, or if its own loop is narrowed. The
    // two rows below sit ten months apart, so any window shorter than 11
    // months sees at most one of them.
    expect(window12({ expenses: [row(new Date(2025, 10, 4), 10), row(new Date(2026, 8, 4), 10)] })).toBe(2);
  });

  it('shares its bucketing with the series, boundary for boundary', () => {
    // Breaks if: a SECOND copy of the month arithmetic is introduced here
    // rather than reusing `monthBuckets`. The last-instant-of-the-month case
    // is where two hand-written copies diverge first, and a count that
    // disagrees with the chart beside it is worse than either being wrong.
    const atTheEdge = [row(new Date(2026, 8, 30, 23, 59, 59, 999), 12)];
    expect(window12({ incomes: atTheEdge })).toBe(1);
    expect(series({ incomes: atTheEdge }).populatedMonthsInRange).toBe(1);
  });

  it('counts by presence, so a break-even month still counts', () => {
    // Breaks if: this counter is written against the net rather than against
    // the rows — the same trap as the in-range count, and it would hide the
    // chips from a break-even user rather than merely the chart.
    expect(
      window12({
        incomes: [row(new Date(2026, 7, 3), 500), row(new Date(2026, 8, 3), 500)],
        expenses: [row(new Date(2026, 7, 4), 500), row(new Date(2026, 8, 4), 500)],
      }),
    ).toBe(2);
  });

  it('ignores deleted rows and rows outside the window', () => {
    // Breaks if: the `isDeleted` guard or the bucket filter is dropped from
    // `rowsInMonth`. A deleted row propping up the chips promises a chart
    // that no range will draw.
    expect(
      window12({
        expenses: [
          row(new Date(2026, 8, 4), 10, { isDeleted: true }),
          row(new Date(2020, 1, 4), 10),
        ],
      }),
    ).toBe(0);
  });

  it('is zero for an account with nothing in it', () => {
    // Breaks if: the filter is inverted, or the length of the buckets array
    // is returned instead of the length of the filtered one — which would
    // report 12 populated months for an empty account.
    expect(window12()).toBe(0);
  });
});

describe('shouldRenderTrendChart / shouldRenderRangeChips — two questions, two inputs', () => {
  it('THE TRAP: data exists, the selected range is sparse, the chips still render', () => {
    // Breaks if: the chips are derived from the chart's own flag — the single
    // change this whole pair exists to make impossible.
    //
    // This is the exact state the trap lives in. The account has two populated
    // months inside the widest (12M) window, but the user has narrowed to 3M
    // and only one of those months falls inside it. Hiding the chips with the
    // chart would leave them looking at a dashboard whose chart vanished with
    // nothing to press: the only control that would widen the range back is
    // the one that just disappeared. It recovers on a remount, which is not a
    // way out a person can find.
    const rows = [row(new Date(2025, 10, 4), 10), row(new Date(2026, 8, 4), 10)];
    const populatedMonthsInRange = countPopulatedMonthsInWindow({
      monthCount: 3,
      now: NOW,
      incomes: [],
      expenses: rows,
    });
    const populatedMonthsInHistory = countPopulatedMonthsInWindow({
      monthCount: 12,
      now: NOW,
      incomes: [],
      expenses: rows,
    });

    expect(populatedMonthsInRange).toBe(1);
    expect(populatedMonthsInHistory).toBe(2);
    expect(shouldRenderTrendChart({ populatedMonthsInRange })).toBe(false);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory })).toBe(true);
  });

  it('no data anywhere: no chart AND no chips', () => {
    // Breaks if: `shouldRenderRangeChips` is made unconditional, or inverted.
    // With nothing to range over, three chips offer three ways to look at the
    // same absence.
    expect(shouldRenderTrendChart({ populatedMonthsInRange: 0 })).toBe(false);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: 0 })).toBe(false);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: 1 })).toBe(false);
  });

  it('a populated range draws both', () => {
    // Breaks if: either predicate is inverted. The ordinary case, and the only
    // one where the hero looks as it always has.
    expect(shouldRenderTrendChart({ populatedMonthsInRange: 2 })).toBe(true);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: 2 })).toBe(true);
  });

  it('both need two months, and two is enough', () => {
    // Breaks if: either `>=` becomes `>` (demanding three, hiding the chart
    // from a user who has exactly the two months a comparison needs) or `<`
    // (drawing everything). Asserted on both, because they are separate
    // functions and only one might be edited.
    expect(shouldRenderTrendChart({ populatedMonthsInRange: 1 })).toBe(false);
    expect(shouldRenderTrendChart({ populatedMonthsInRange: 2 })).toBe(true);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: 1 })).toBe(false);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: 2 })).toBe(true);
  });

  it('both read the one shared threshold constant', () => {
    // Breaks if: either function hardcodes its own number instead of reading
    // NET_PROFIT_MIN_POPULATED_MONTHS. Two questions is the point; two
    // thresholds is not, and would let the chips promise a chart the chart
    // then refuses to draw.
    expect(NET_PROFIT_MIN_POPULATED_MONTHS).toBe(2);
    const n = NET_PROFIT_MIN_POPULATED_MONTHS;
    expect(shouldRenderTrendChart({ populatedMonthsInRange: n })).toBe(true);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: n })).toBe(true);
    expect(shouldRenderTrendChart({ populatedMonthsInRange: n - 1 })).toBe(false);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory: n - 1 })).toBe(false);
  });

  it('the chips can never promise a chart no range would draw', () => {
    // Breaks if: the chips are fed a count taken over a window WIDER than the
    // widest selectable range (literally-all-history), which would show the
    // control to a dormant account whose only activity predates every range —
    // three settings, three empty charts. Since the ranges are nested, the
    // widest window's count is the exact guarantee that some setting works.
    const dormant = [row(new Date(2020, 0, 4), 10), row(new Date(2020, 1, 4), 10)];
    const populatedMonthsInHistory = countPopulatedMonthsInWindow({
      monthCount: 12,
      now: NOW,
      incomes: [],
      expenses: dormant,
    });
    expect(populatedMonthsInHistory).toBe(0);
    expect(shouldRenderRangeChips({ populatedMonthsInHistory })).toBe(false);
  });
});
