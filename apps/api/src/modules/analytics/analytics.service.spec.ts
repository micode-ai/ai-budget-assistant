import { computeVsAverageFromTotals, AnalyticsService } from './analytics.service';

describe('computeVsAverageFromTotals', () => {
  it('returns 0 when all historical months are zero (new account)', () => {
    expect(computeVsAverageFromTotals(500, [0, 0, 0])).toBe(0);
  });

  it('returns 100 when rolling average is 0 but current spend is positive', () => {
    // Edge case: prior months had data but summed contribution hits zero somehow
    // (guarded by the rollingAverage === 0 branch)
    expect(computeVsAverageFromTotals(200, [0, 0, 0])).toBe(0); // hasData=false wins first
  });

  it('returns positive percentage when current spend exceeds rolling average', () => {
    // avg = (100 + 200 + 300) / 3 = 200; current = 300 → +50 %
    const result = computeVsAverageFromTotals(300, [100, 200, 300]);
    expect(result).toBe(50);
  });

  it('returns negative percentage when current spend is below rolling average', () => {
    // avg = 200; current = 100 → −50 %
    const result = computeVsAverageFromTotals(100, [100, 200, 300]);
    expect(result).toBe(-50);
  });

  it('returns 0 when current spend exactly equals rolling average', () => {
    expect(computeVsAverageFromTotals(200, [200, 200, 200])).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    // avg = (100 + 200) / 2 = 150; current = 175 → +16.666… → rounds to 16.67
    const result = computeVsAverageFromTotals(175, [100, 200]);
    expect(result).toBe(16.67);
  });

  it('works with a single historical month', () => {
    // avg = 400; current = 600 → +50 %
    expect(computeVsAverageFromTotals(600, [400])).toBe(50);
  });

  it('ignores zero months in the average but still uses them in the divisor', () => {
    // hasData=true because one month is non-zero; avg = (0 + 0 + 300) / 3 = 100
    // current = 150 → +50 %
    const result = computeVsAverageFromTotals(150, [0, 0, 300]);
    expect(result).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// AnalyticsService.getSummary — split receivable filter
// ---------------------------------------------------------------------------
describe('AnalyticsService.getSummary', () => {
  it('excludes split receivables from spend but still counts a standalone debt', async () => {
    const prisma: any = {
      account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
      income: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };
    const cache: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AnalyticsService(prisma, cache);
    await service.getSummary('acc-1', new Date('2026-07-01'), new Date('2026-07-31'));

    const where = (prisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    // The marker the split feature sets — must be filtered out.
    expect(where.isSplitReceivable).toBe(false);
    // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
    // filtering on it would rewrite the numbers of every user tracking debts.
    expect(where.isDebt).toBeUndefined();
  });
});

describe('AnalyticsService.getDepositRows', () => {
  const makePrisma = (rows: unknown[], encryptionTier = 0) => ({
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier }) },
    expense: { findMany: jest.fn().mockResolvedValue(rows) },
  }) as any;

  const cache = () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn() }) as any;

  const deposit = (n: number) => ({
    date: new Date('2026-08-14'),
    merchant: 'Biedronka',
    description: null,
    depositAmount: String(n),
    currencyCode: 'PLN',
  });

  it('selects only receipts that actually carried a deposit', async () => {
    const prisma = makePrisma([deposit(4.5)]);
    await new AnalyticsService(prisma, cache()).getDepositRows(
      'acc-1',
      new Date('2026-08-01'),
      new Date('2026-08-31'),
    );

    const args = prisma.expense.findMany.mock.calls[0][0];
    // `gt: 0` excludes NULL by SQL semantics, which is what makes this the
    // "receipts with a deposit" query rather than "every receipt".
    expect(args.where.depositAmount).toEqual({ gt: 0 });
    expect(args.where.accountId).toBe('acc-1');
    expect(args.where.date).toEqual({ gte: new Date('2026-08-01'), lte: new Date('2026-08-31') });
  });

  it('leaves out deleted rows, planned expenses and split receivables', async () => {
    const prisma = makePrisma([]);
    await new AnalyticsService(prisma, cache()).getDepositRows('acc-1', new Date(0), new Date());

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.isDeleted).toBe(false);
    // A planned purchase-request expense is not money spent, and a split
    // receivable is somebody else's share — neither may inflate the deposit.
    expect(where.isPlanned).toBe(false);
    expect(where.isSplitReceivable).toBe(false);
  });

  it('returns the newest receipts first', async () => {
    const prisma = makePrisma([]);
    await new AnalyticsService(prisma, cache()).getDepositRows('acc-1', new Date(0), new Date());

    expect(prisma.expense.findMany.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
  });

  it('reports truncation instead of presenting a capped total as complete', async () => {
    // One row past the ceiling: the query asks for limit + 1 precisely to see this.
    const prisma = makePrisma(Array.from({ length: 5001 }, () => deposit(1)));
    const result = await new AnalyticsService(prisma, cache()).getDepositRows(
      'acc-1',
      new Date(0),
      new Date(),
    );

    expect(prisma.expense.findMany.mock.calls[0][0].take).toBe(5001);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(5000);
  });

  it('does not report truncation when the rows fit', async () => {
    const prisma = makePrisma([deposit(4.5), deposit(2)]);
    const result = await new AnalyticsService(prisma, cache()).getDepositRows(
      'acc-1',
      new Date(0),
      new Date(),
    );

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it('refuses a fully encrypted account without querying it', async () => {
    const prisma = makePrisma([deposit(4.5)], 2);
    const result = await new AnalyticsService(prisma, cache()).getDepositRows(
      'acc-1',
      new Date(0),
      new Date(),
    );

    expect(result).toEqual({ encryptionRestricted: true, rows: [], truncated: false });
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });
});
