import { computeBudgetPeriod, BudgetsService } from './budgets.service';

const fixedNow = new Date('2026-04-30T12:00:00.000Z');

const baseBudget = {
  startDate: new Date('2026-03-01T00:00:00.000Z'),
  endDate: null as Date | null,
};

describe('computeBudgetPeriod', () => {
  it('monthly budget rolls to current calendar month, not since startDate', () => {
    // Reproduces the production bug: monthly budget started 2026-03-01,
    // queried on 2026-04-30 must only cover April, not Mar 1 → Apr 30.
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'monthly' },
      fixedNow,
    );
    expect(periodStart.getFullYear()).toBe(2026);
    expect(periodStart.getMonth()).toBe(3); // April (0-indexed)
    expect(periodStart.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(3);
    expect(periodEnd.getDate()).toBe(30);
  });

  it('weekly budget uses Mon–Sun of the current week', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'weekly' },
      fixedNow,
    );
    expect(periodStart.getDay()).toBe(1); // Monday
    expect(periodEnd.getDay()).toBe(0);   // Sunday
    expect(periodEnd.getTime() - periodStart.getTime()).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });

  it('daily budget covers the current day only', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'daily' },
      fixedNow,
    );
    expect(periodStart.getDate()).toBe(periodEnd.getDate());
    expect(periodStart.getHours()).toBe(0);
    expect(periodEnd.getHours()).toBe(23);
  });

  it('yearly budget covers Jan 1 – Dec 31 of the current year', () => {
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { ...baseBudget, period: 'yearly' },
      fixedNow,
    );
    expect(periodStart.getMonth()).toBe(0);
    expect(periodStart.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(11);
    expect(periodEnd.getDate()).toBe(31);
  });

  it('custom budget keeps its fixed [startDate, endDate] window', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    const end = new Date('2026-06-15T00:00:00.000Z');
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { period: 'custom', startDate: start, endDate: end },
      fixedNow,
    );
    expect(periodStart).toBe(start);
    expect(periodEnd).toBe(end);
  });

  it('custom budget without endDate falls back to now', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    const { periodStart, periodEnd } = computeBudgetPeriod(
      { period: 'custom', startDate: start, endDate: null },
      fixedNow,
    );
    expect(periodStart).toBe(start);
    expect(periodEnd).toBe(fixedNow);
  });

  it('unknown period falls back to monthly', () => {
    const { periodStart } = computeBudgetPeriod(
      { ...baseBudget, period: 'quarterly' },
      fixedNow,
    );
    expect(periodStart.getDate()).toBe(1);
    expect(periodStart.getMonth()).toBe(3); // April
  });
});

describe('BudgetsService.create — offline-first idempotency (ABA-316)', () => {
  const existingBudget = { id: 'b-1', clientId: 'local-1', name: 'Groceries', categoryAllocations: [] };
  const dto = {
    localId: 'local-1', name: 'Groceries', amount: 500,
    currencyCode: 'PLN', period: 'monthly', startDate: '2026-07-01',
  };

  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  it('returns the existing budget on a resent create (pre-check hit) without inserting', async () => {
    const create = jest.fn();
    const prisma: any = {
      budget: { findUnique: jest.fn().mockResolvedValue(existingBudget), create },
      $transaction: jest.fn(),
    };
    const res = await makeService(prisma).create('acc-1', 'u1', dto);
    expect(res).toBe(existingBudget);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(prisma.budget.findUnique).toHaveBeenCalledWith({
      where: { accountId_clientId: { accountId: 'acc-1', clientId: 'local-1' } },
      include: expect.anything(),
    });
  });

  it('recovers from a concurrent P2002 by re-fetching the committed budget', async () => {
    const prisma: any = {
      budget: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existingBudget),
      },
      $transaction: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' })),
    };
    const res = await makeService(prisma).create('acc-1', 'u1', dto);
    expect(res).toBe(existingBudget);
    expect(prisma.budget.findUnique).toHaveBeenCalledTimes(2);
  });

  it('creates a new budget when none exists (happy path)', async () => {
    const withAllocations = { id: 'b-new', name: 'Groceries', categoryAllocations: [] };
    const tx = {
      budget: {
        create: jest.fn().mockResolvedValue({ id: 'b-new' }),
        findUnique: jest.fn().mockResolvedValue(withAllocations),
      },
      budgetCategory: { createMany: jest.fn() },
    };
    const prisma: any = {
      budget: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const res = await makeService(prisma).create('acc-1', 'u1', dto);
    expect(res).toBe(withAllocations);
    expect(tx.budget.create).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-P2002 errors', async () => {
    const boom = Object.assign(new Error('db down'), { code: 'P1001' });
    const prisma: any = {
      budget: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(boom),
    };
    await expect(makeService(prisma).create('acc-1', 'u1', dto)).rejects.toBe(boom);
  });
});

describe('getHistory month stepping', () => {
  function makeHistoryService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns distinct consecutive months when run on the 31st', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 2, 31, 10, 0, 0));

    const budget = {
      id: 'b1',
      period: 'monthly',
      amount: 100,
      currencyCode: 'USD',
      startDate: new Date(2026, 0, 1),
      endDate: null,
      categoryAllocations: [],
    };

    const prisma: any = {
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    };
    const service = makeHistoryService(prisma);
    jest.spyOn(service, 'findOne').mockResolvedValue(budget as any);

    const history = await service.getHistory('acc1', 'b1', 3);

    const starts = history.map((h) => new Date(h.periodStart).getMonth());
    expect(starts).toEqual([0, 1, 2]); // January, February, March -- no repeats
    expect(new Set(starts).size).toBe(3);
  });

  // This is the only place shiftFinancialMonth() and computeBudgetPeriod()
  // interact in a loop for an ANCHORED (non-null anchorDay) budget, so it is
  // the one spot a month-skip/overlap regression on the anchored branch could
  // hide undetected. anchorDay=31 is deliberately the hardest case: every
  // short month (Feb/Apr/Jun/Sep/Nov) clamps the anchor to its own last day,
  // so the window boundary "slides" instead of reusing day 31 verbatim, and
  // the walk also crosses a Dec->Jan year rollover.
  it('returns contiguous, non-overlapping periods when anchored to day 31, walking back across short months and a year boundary', async () => {
    // 31 March 2026, 10:00 local -- matches financialMonth()'s "now >=
    // thisAnchor" branch (thisAnchor for March 31 is midnight the same day).
    jest.useFakeTimers().setSystemTime(new Date(2026, 2, 31, 10, 0, 0));

    const budget = {
      id: 'b1',
      period: 'monthly',
      amount: 100,
      currencyCode: 'USD',
      startDate: new Date(2025, 0, 1),
      endDate: null,
      categoryAllocations: [],
    };

    const prisma: any = {
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    };
    const service = makeHistoryService(prisma);
    jest.spyOn(service, 'findOne').mockResolvedValue(budget as any);

    const history = await service.getHistory('acc1', 'b1', 6, 31);
    expect(history).toHaveLength(6);

    // Derived by hand (not read off a passing run) from financialMonth()'s
    // rule -- start = anchorDateFor(thisMonth), end = next anchor - 1ms,
    // where anchorDateFor clamps day 31 to min(31, daysInMonth) -- walking
    // backward i=0..5 via shiftFinancialMonth(now, -i, 31) from "now" =
    // 31 Mar 2026:
    //   i=0  Mar 31 2026 00:00:00.000 -> Apr 29 2026 23:59:59.999  (Apr has 30 days)
    //   i=1  Feb 28 2026 00:00:00.000 -> Mar 30 2026 23:59:59.999  (Feb 2026 has 28 days)
    //   i=2  Jan 31 2026 00:00:00.000 -> Feb 27 2026 23:59:59.999
    //   i=3  Dec 31 2025 00:00:00.000 -> Jan 30 2026 23:59:59.999  (year rollover)
    //   i=4  Nov 30 2025 00:00:00.000 -> Dec 30 2025 23:59:59.999  (Nov has 30 days)
    //   i=5  Oct 31 2025 00:00:00.000 -> Nov 29 2025 23:59:59.999
    // getHistory() reverses the loop order to oldest-first, so history[0] is
    // i=5 and history[5] is i=0.
    const expected = [
      { start: new Date(2025, 9, 31, 0, 0, 0, 0), end: new Date(2025, 10, 29, 23, 59, 59, 999) }, // Oct 31 -> Nov 29
      { start: new Date(2025, 10, 30, 0, 0, 0, 0), end: new Date(2025, 11, 30, 23, 59, 59, 999) }, // Nov 30 -> Dec 30
      { start: new Date(2025, 11, 31, 0, 0, 0, 0), end: new Date(2026, 0, 30, 23, 59, 59, 999) },  // Dec 31 -> Jan 30
      { start: new Date(2026, 0, 31, 0, 0, 0, 0), end: new Date(2026, 1, 27, 23, 59, 59, 999) },   // Jan 31 -> Feb 27
      { start: new Date(2026, 1, 28, 0, 0, 0, 0), end: new Date(2026, 2, 30, 23, 59, 59, 999) },   // Feb 28 -> Mar 30
      { start: new Date(2026, 2, 31, 0, 0, 0, 0), end: new Date(2026, 3, 29, 23, 59, 59, 999) },   // Mar 31 -> Apr 29
    ];

    history.forEach((period, i) => {
      expect(new Date(period.periodStart).getTime()).toBe(expected[i].start.getTime());
      expect(new Date(period.periodEnd).getTime()).toBe(expected[i].end.getTime());
    });

    // Contiguous and non-overlapping: each period's start is exactly 1ms
    // after the previous period's end -- no gap, no overlap.
    for (let i = 1; i < history.length; i++) {
      const prevEnd = new Date(history[i - 1].periodEnd).getTime();
      const curStart = new Date(history[i].periodStart).getTime();
      expect(curStart - prevEnd).toBe(1);
    }

    // No two periods share a single calendar day.
    const dayKeys = history.map((p) => new Date(p.periodStart).toDateString());
    expect(new Set(dayKeys).size).toBe(dayKeys.length);
    const endDayKeys = history.map((p) => new Date(p.periodEnd).toDateString());
    expect(new Set(endDayKeys).size).toBe(endDayKeys.length);
  });
});

// Regression for the ABA-374 bug class: the mobile client addresses a
// budget by its local clientId until a full sync round-trip backfills the
// server PK. Every other budget method (update/remove/getHistory/getProgress)
// funnels through findOne, so this one lookup fixes the whole module.
describe('BudgetsService.findOne — clientId resolution (ABA-374 bug class)', () => {
  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  it('resolves a budget addressed by its local clientId, not just the server PK', async () => {
    const budget = { id: 'server-budget-1', clientId: 'local-budget-1', categoryAllocations: [] };
    const prisma: any = {
      budget: { findFirst: jest.fn().mockResolvedValue(budget) },
    };

    const result = await makeService(prisma).findOne('acc-1', 'local-budget-1');

    expect(result).toBe(budget);
    const where = prisma.budget.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ id: 'local-budget-1' }, { clientId: 'local-budget-1' }]);
  });

  it('throws NotFoundException when neither id nor clientId matches', async () => {
    const prisma: any = {
      budget: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(makeService(prisma).findOne('acc-1', 'missing')).rejects.toThrow('Budget not found');
  });
});

/**
 * ABA-523. `getProgress` had no test at all, and the projection it returns is
 * read by eight surfaces, so the wiring is worth pinning even though the
 * arithmetic itself lives in `budget-projection.spec.ts`.
 *
 * The reported case: an 8000 PLN monthly budget where rent (4350, paid once)
 * was 73% of the month's spend. `spent / daysElapsed * totalDays` charged that
 * rent three times and reported a 19 795 zl month.
 */
describe('BudgetsService.getProgress — the projection does not re-spend a lump', () => {
  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  /** Nine elapsed days of a 30-day month, one of them the rent. */
  function prismaWithSeptember(spent: number, dailyTotals: number[]) {
    return {
      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          amount: 8000,
          currencyCode: 'PLN',
          period: 'monthly',
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: null,
          categoryAllocations: [],
          isActive: true,
          isDeleted: false,
        }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: spent } }),
        groupBy: jest.fn().mockResolvedValue(
          dailyTotals.map((amount, i) => ({
            date: new Date(Date.UTC(2026, 8, i + 1)),
            _sum: { amount },
          })),
        ),
      },
    } as any;
  }

  it('excludes the largest day from the rate while still counting its money', async () => {
    const dailyTotals = [119.47, 125.09, 893.87, 222.58, 4350, 96.6, 131.12];
    const spent = dailyTotals.reduce((a, b) => a + b, 0);

    const progress = await makeService(prismaWithSeptember(spent, dailyTotals)).getProgress('acc-1', 'b1');

    // The old formula would have been spent/daysElapsed*totalDays, which for
    // any elapsed count in this period lands far past the budget.
    expect(progress.projectedTotal).toBeLessThan((spent / 9) * 30);
    // The rent stays inside `spent`, so the projection can never dip below it.
    expect(progress.projectedTotal).toBeGreaterThanOrEqual(spent);
    // And the rate is not the naive mean.
    expect(progress.dailyBurnRate).toBeLessThan(spent / 9);
  });

  it('asks the database for per-day totals, not just a sum', async () => {
    // Without the groupBy there is no way to drop a DAY, and the fix silently
    // degrades back to the mean.
    const prisma = prismaWithSeptember(1000, [500, 500]);

    await makeService(prisma).getProgress('acc-1', 'b1');

    expect(prisma.expense.groupBy).toHaveBeenCalled();
    expect(prisma.expense.groupBy.mock.calls[0][0].by).toEqual(['date']);
  });

  it('falls back to the money already spent when it refuses to project', async () => {
    // A period only a day or two old has no rate worth extrapolating. The DTO
    // field stays non-nullable, and `spent` is the value that makes all eight
    // consumers' `projectedTotal > amount` test fall silent.
    const prisma = prismaWithSeptember(4350, [4350]);
    const service = makeService(prisma);
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-02T12:00:00Z').getTime());

    const progress = await service.getProgress('acc-1', 'b1');

    expect(progress.projectedTotal).toBe(4350);
    expect(progress.dailyBurnRate).toBe(0);
    expect(progress.estimatedExhaustionDate).toBeUndefined();
    (Date.now as jest.Mock).mockRestore();
  });
});

/**
 * A budget on a category a receipt only reaches through a split used to read
 * zero, while a budget on the receipt's own category absorbed the whole
 * receipt. Both are the same defect: budgets scoped spend by
 * `expense.categoryId` and never read `expense_category_splits`.
 * See docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 */
describe('BudgetsService.getProgress — category budgets count splits', () => {
  const GROCERIES = 'cat-groceries';
  const HOUSEHOLD = 'cat-household';
  const DEPOSIT = 'cat-deposit';

  function makeService(prisma: any) {
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    return new BudgetsService(prisma, gamification, cache);
  }

  /** The reported receipt: 240 PLN split 180 groceries / 35 household / 25 deposit. */
  const splitReceiptRow = {
    amount: 240,
    date: new Date('2026-09-08T00:00:00Z'),
    categoryId: GROCERIES,
    categorySplits: [
      { categoryId: GROCERIES, amount: 180 },
      { categoryId: HOUSEHOLD, amount: 35 },
      { categoryId: DEPOSIT, amount: 25 },
    ],
  };

  function prismaFor(allocations: Array<{ categoryId: string; amount: number }>, rows: any[]) {
    return {
      budget: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          amount: 1000,
          currencyCode: 'PLN',
          period: 'monthly',
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: null,
          categoryAllocations: allocations.map((a) => ({ ...a, category: { name: a.categoryId } })),
          isActive: true,
          isDeleted: false,
        }),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue(rows),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
  }

  it('gives a split-only category its share instead of zero', async () => {
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], [splitReceiptRow]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(35);
  });

  it('stops the receipt’s own category absorbing the whole receipt', async () => {
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], [splitReceiptRow]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(180);
  });

  it('still gives an unsplit expense its whole amount', async () => {
    const plain = { amount: 90, date: new Date('2026-09-03T00:00:00Z'), categoryId: GROCERIES, categorySplits: [] };
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], [plain]);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(90);
  });

  it('breaks the total down per allocation, and the rows sum to it', async () => {
    const prisma = prismaFor(
      [
        { categoryId: GROCERIES, amount: 500 },
        { categoryId: HOUSEHOLD, amount: 500 },
      ],
      [splitReceiptRow],
    );

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    const byId = new Map(progress.categoryBreakdown!.map((c: any) => [c.categoryId, c.spent]));
    expect(byId.get(GROCERIES)).toBe(180);
    expect(byId.get(HOUSEHOLD)).toBe(35);
    expect(progress.spent).toBe(215);
    expect([...byId.values()].reduce((a, b) => a + b, 0)).toBe(progress.spent);
  });

  it('asks for expenses whose own category OR a split matches', async () => {
    // Filtering on categoryId alone in SQL is the bug: an expense whose own
    // category is not in the budget can still hold a split into it.
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], [splitReceiptRow]);

    await makeService(prisma).getProgress('acc-1', 'b1');

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.categoryId).toBeUndefined();
    expect(where.OR).toEqual([
      { categoryId: { in: [HOUSEHOLD] } },
      { categorySplits: { some: { isDeleted: false, categoryId: { in: [HOUSEHOLD] } } } },
    ]);
  });

  it('excludes split receivables and planned expenses, like the cron and the phone already do', async () => {
    const prisma = prismaFor([{ categoryId: GROCERIES, amount: 1000 }], []);

    await makeService(prisma).getProgress('acc-1', 'b1');

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.isSplitReceivable).toBe(false);
    expect(where.isPlanned).toBe(false);
  });

  it('keeps the cheap aggregate for a budget with no category allocations', async () => {
    // Splits sum to the expense amount, so attribution would return the same
    // number. Loading rows for it would be pure cost.
    const prisma = prismaFor([], []);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 240 } });

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    expect(progress.spent).toBe(240);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.aggregate).toHaveBeenCalled();
  });

  it('feeds the projection attributed money, one total per day', async () => {
    // `daysElapsed` needs to clear MIN_DAYS_FOR_BUDGET_PROJECTION (5) for the
    // rate to be anything but null, and unlike the sibling ABA-523 block this
    // one otherwise runs on the real wall clock — pin it, same convention.
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-10T12:00:00Z').getTime());

    const rows = [
      splitReceiptRow,
      { ...splitReceiptRow, date: new Date('2026-09-09T00:00:00Z') },
    ];
    const prisma = prismaFor([{ categoryId: HOUSEHOLD, amount: 1000 }], rows);

    const progress = await makeService(prisma).getProgress('acc-1', 'b1');

    // 35 on each of two days, not 240 on each.
    expect(progress.spent).toBe(70);
    // A loose `<= 35` bound would pass under every regression this test
    // exists to catch: collapsing the per-day grouping onto one bucket
    // (dailyTotals=[70]) drops that single, largest day out of the rate
    // entirely and yields 0; feeding the RAW 240 row amount instead of the
    // attributed 35 (dailyTotals=[240, 240]) yields 240/9 ≈ 26.67 — both
    // pass `<= 35`. The real number, correctly grouped by day AND
    // attributed, is one household day's 35 spread over the 9 non-largest
    // elapsed days of this mocked instant: 35/9.
    expect(progress.dailyBurnRate).toBeCloseTo(3.888888888888889, 6);
    (Date.now as jest.Mock).mockRestore();
  });
});
