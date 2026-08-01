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
