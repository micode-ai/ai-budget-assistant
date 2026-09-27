import { VoiceDigestFactsService } from '../voice-digest-facts.service';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

function expenseRow(o: {
  amount: number;
  currencyCode?: string;
  date: Date;
  categoryId?: string | null;
  categoryName?: string | null;
  coicopDivision?: string | null;
  isRecurring?: boolean;
  splits?: Array<{ categoryId: string; amount: number; categoryName: string; coicopDivision?: string | null }>;
}) {
  return {
    amount: o.amount,
    currencyCode: o.currencyCode ?? 'PLN',
    date: o.date,
    categoryId: o.categoryId ?? null,
    isRecurring: o.isRecurring ?? false,
    category: o.categoryName
      ? { id: o.categoryId ?? 'cat', name: o.categoryName, coicopDivision: o.coicopDivision ?? null }
      : null,
    categorySplits: (o.splits ?? []).map((s) => ({
      categoryId: s.categoryId,
      amount: s.amount,
      category: { id: s.categoryId, name: s.categoryName, coicopDivision: s.coicopDivision ?? null },
    })),
  };
}

function make(o: {
  expenses?: ReturnType<typeof expenseRow>[];
  expenseFindManyImpl?: () => Promise<unknown>;
  rates?: Record<string, number> | null;
  safeToSpend?: any;
  safeToSpendImpl?: () => Promise<unknown>;
  shield?: any;
  shieldImpl?: () => Promise<unknown>;
  restock?: any;
  realSalary?: any;
  coicopClassifier?: any;
} = {}) {
  const prisma: any = {
    expense: {
      findMany: o.expenseFindManyImpl
        ? jest.fn().mockImplementation(o.expenseFindManyImpl)
        : jest.fn().mockResolvedValue(o.expenses ?? []),
    },
  };
  const exchangeRateService: any = {
    getRates: jest.fn().mockResolvedValue({ rates: o.rates === undefined ? { EUR: 4.3 } : (o.rates ?? {}) }),
  };
  const safeToSpend: any = {
    compute: o.safeToSpendImpl
      ? jest.fn().mockImplementation(o.safeToSpendImpl)
      : jest.fn().mockResolvedValue(
          o.safeToSpend ?? { safeToSpendToday: 64.4, daysRemaining: 5, incomeInferred: true },
        ),
  };
  const inflationShield: any = {
    getShield: o.shieldImpl
      ? jest.fn().mockImplementation(o.shieldImpl)
      : jest.fn().mockResolvedValue(o.shield ?? { items: [] }),
  };
  const shoppingList: any = {
    getRestockSuggestions: jest.fn().mockResolvedValue(o.restock ?? []),
  };
  const realSalary: any = {
    compute: jest.fn().mockResolvedValue(o.realSalary ?? { status: 'no_salary_confirmed', realChangePct: null }),
  };
  const coicopClassifier: any = o.coicopClassifier ?? { ensureClassified: jest.fn().mockResolvedValue(undefined) };
  const svc = new VoiceDigestFactsService(
    prisma,
    exchangeRateService,
    safeToSpend,
    inflationShield,
    shoppingList,
    realSalary,
    coicopClassifier,
  );
  return { svc, prisma, exchangeRateService, safeToSpend, inflationShield, shoppingList, realSalary, coicopClassifier };
}

describe('VoiceDigestFactsService.gather — spend window bucketing', () => {
  it('buckets an expense at the very start of window 0 (now-7d, inclusive)', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 100, date: daysAgo(7) })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(100);
    expect(r.priorWeekTotals.every((t) => t === 0)).toBe(true);
  });

  it('excludes an expense dated exactly "now" (window 0 upper bound is exclusive)', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 100, date: NOW })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(0);
  });

  it('buckets an expense one ms inside window 0 into window 0, not window 1', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 50, date: new Date(daysAgo(7).getTime() + 1) })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(50);
    expect(r.priorWeekTotals[0]).toBe(0);
  });

  it('buckets an expense one ms before window 0 into window 1', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 50, date: new Date(daysAgo(7).getTime() - 1) })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(0);
    expect(r.priorWeekTotals[0]).toBe(50); // window 1 is priorWeekTotals[0] (newest first)
  });

  it('buckets an expense at the outer edge of window 8 (now-63d, inclusive)', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 70, date: daysAgo(63) })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.priorWeekTotals[7]).toBe(70); // window 8 is priorWeekTotals[7]
  });

  it('drops an expense older than 63 days entirely', async () => {
    const { svc } = make({ expenses: [expenseRow({ amount: 999, date: new Date(daysAgo(63).getTime() - 1) })] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(0);
    expect(r.priorWeekTotals.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('reports priorWeekTotals newest-first across 8 distinct windows', async () => {
    // age = 7*j + 3 days lands squarely inside window j (each window spans
    // age in (7j, 7(j+1)] days), avoiding the boundary ambiguity exercised above.
    const amounts = [5, 10, 20, 30, 40, 50, 60, 70, 80];
    const { svc } = make({
      expenses: amounts.map((amount, j) => expenseRow({ amount, date: daysAgo(7 * j + 3) })),
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(5);
    expect(r.priorWeekTotals).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });
});

describe('VoiceDigestFactsService.gather — category attribution', () => {
  it('counts a split expense by its split categories, not its own category', async () => {
    const { svc } = make({
      expenses: [
        expenseRow({
          amount: 100,
          date: daysAgo(1),
          categoryId: 'cat-receipt',
          categoryName: 'Receipt',
          splits: [
            { categoryId: 'cat-food', amount: 60, categoryName: 'Food' },
            { categoryId: 'cat-alcohol', amount: 40, categoryName: 'Alcohol' },
          ],
        }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(100);
    const byName = Object.fromEntries(r.categoryWeek.map((c) => [c.name, c.total]));
    expect(byName).toEqual({ Food: 60, Alcohol: 40 });
    expect(byName.Receipt).toBeUndefined();
  });

  it('skips an uncategorized attribution from categoryWeek/categoryUsual but keeps it in the total', async () => {
    const { svc } = make({
      expenses: [expenseRow({ amount: 30, date: daysAgo(1) })], // no category, no splits
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(30);
    expect(r.categoryWeek).toEqual([]);
  });

  it('computes categoryUsual as the per-category mean over the 8 prior windows', async () => {
    const { svc } = make({
      expenses: [
        expenseRow({ amount: 100, date: daysAgo(10), categoryId: 'c1', categoryName: 'Groceries' }),
        expenseRow({ amount: 60, date: daysAgo(17), categoryId: 'c1', categoryName: 'Groceries' }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.categoryUsual).toEqual([{ name: 'Groceries', total: 20 }]); // (100+60)/8
  });
});

describe('VoiceDigestFactsService.gather — FX', () => {
  it('skips an expense whose currency has no known rate', async () => {
    const { svc } = make({
      rates: {}, // no EUR entry
      expenses: [
        expenseRow({ amount: 100, currencyCode: 'PLN', date: daysAgo(1) }),
        expenseRow({ amount: 50, currencyCode: 'EUR', date: daysAgo(1) }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(100);
  });

  it('converts a foreign-currency expense when a rate is available', async () => {
    const { svc } = make({
      rates: { EUR: 4 },
      expenses: [expenseRow({ amount: 40, currencyCode: 'EUR', date: daysAgo(1) })],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(10); // 40 / 4
  });
});

describe('VoiceDigestFactsService.gather — Prisma where clause', () => {
  it('excludes deleted/planned/split-receivable/recurring rows, not isDebt/isDebtRepayment, and filters the 63-day range', async () => {
    const { svc, prisma } = make();
    await svc.gather('acc', 'u1', 'PLN', NOW);
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      accountId: 'acc',
      isDeleted: false,
      isPlanned: false,
      isRecurring: false,
      isSplitReceivable: false,
      date: { gte: expect.any(Date) },
    });
    expect(where.date.gte.getTime()).toBe(NOW.getTime() - 63 * DAY_MS);
  });

  it('selects coicopDivision for both the expense category and each split category', async () => {
    const { svc, prisma } = make();
    await svc.gather('acc', 'u1', 'PLN', NOW);
    const select = prisma.expense.findMany.mock.calls[0][0].select;
    expect(select.category.select.coicopDivision).toBe(true);
    expect(select.categorySplits.select.category.select.coicopDivision).toBe(true);
  });
});

describe('VoiceDigestFactsService.gather — everyday spend only (recurring & CP04 housing/utilities exclusion)', () => {
  it('calls CoicopClassifierService.ensureClassified(accountId) before loading spend', async () => {
    const { svc, coicopClassifier } = make({ expenses: [] });
    await svc.gather('acc-1', 'u1', 'PLN', NOW);
    expect(coicopClassifier.ensureClassified).toHaveBeenCalledWith('acc-1');
  });

  it('continues gathering facts when ensureClassified rejects (logged, not thrown)', async () => {
    const coicopClassifier: any = { ensureClassified: jest.fn().mockRejectedValue(new Error('classify down')) };
    const { svc } = make({
      expenses: [expenseRow({ amount: 40, date: daysAgo(1), categoryId: 'c1', categoryName: 'Food' })],
      coicopClassifier,
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(40);
  });

  it('drops the whole amount of an expense whose own category is CP04 (housing/utilities)', async () => {
    const { svc } = make({
      expenses: [
        expenseRow({ amount: 2000, date: daysAgo(1), categoryId: 'cat-rent', categoryName: 'Rent', coicopDivision: 'CP04' }),
        expenseRow({ amount: 50, date: daysAgo(1), categoryId: 'cat-food', categoryName: 'Food', coicopDivision: 'CP01' }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(50);
    const byName = Object.fromEntries(r.categoryWeek.map((c) => [c.name, c.total]));
    expect(byName).toEqual({ Food: 50 });
    expect(byName.Rent).toBeUndefined();
  });

  it('drops only the CP04 part of a split expense, keeping the rest', async () => {
    const { svc } = make({
      expenses: [
        expenseRow({
          amount: 100,
          date: daysAgo(1),
          categoryId: 'cat-receipt',
          categoryName: 'Receipt',
          splits: [
            { categoryId: 'cat-rent', amount: 70, categoryName: 'Rent', coicopDivision: 'CP04' },
            { categoryId: 'cat-food', amount: 30, categoryName: 'Food', coicopDivision: 'CP01' },
          ],
        }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(30);
    const byName = Object.fromEntries(r.categoryWeek.map((c) => [c.name, c.total]));
    expect(byName).toEqual({ Food: 30 });
    expect(byName.Rent).toBeUndefined();
  });

  it('excludes CP04 parts from categoryUsual (prior windows) too', async () => {
    const { svc } = make({
      expenses: [
        expenseRow({ amount: 2000, date: daysAgo(10), categoryId: 'cat-rent', categoryName: 'Rent', coicopDivision: 'CP04' }),
        expenseRow({ amount: 100, date: daysAgo(10), categoryId: 'cat-food', categoryName: 'Food', coicopDivision: 'CP01' }),
      ],
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    const byName = Object.fromEntries(r.categoryUsual.map((c) => [c.name, c.total]));
    expect(byName).toEqual({ Food: 100 / 8 });
    expect(byName.Rent).toBeUndefined();
  });
});

describe('VoiceDigestFactsService.gather — external service failures degrade gracefully', () => {
  it('a failing shield call yields shieldItem: null and every other fact still arrives', async () => {
    const { svc } = make({
      expenses: [expenseRow({ amount: 100, date: daysAgo(1) })],
      shieldImpl: () => Promise.reject(new Error('shield down')),
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.shieldItem).toBeNull();
    expect(r.weekTotal).toBe(100);
    expect(r.safeToSpendToday).toBe(64.4); // gather() reports the raw figure; rounding is assembleDigestFacts's job
  });

  it('a failing safe-to-spend call yields null safeToSpendToday/daysToIncome and the rest still arrives', async () => {
    const { svc } = make({
      expenses: [expenseRow({ amount: 100, date: daysAgo(1) })],
      safeToSpendImpl: () => Promise.reject(new Error('sts down')),
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.safeToSpendToday).toBeNull();
    expect(r.daysToIncome).toBeNull();
    expect(r.weekTotal).toBe(100);
  });

  it('a failing expense query yields zeroed spend facts, not a thrown exception', async () => {
    const { svc } = make({ expenseFindManyImpl: () => Promise.reject(new Error('db down')) });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.weekTotal).toBe(0);
    expect(r.priorWeekTotals).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.categoryWeek).toEqual([]);
    expect(r.categoryUsual).toEqual([]);
  });

  it('a failing restock-list call yields an empty restockNames array', async () => {
    const shoppingListFailing: any = { getRestockSuggestions: jest.fn().mockRejectedValue(new Error('down')) };
    const svc = new VoiceDigestFactsService(
      { expense: { findMany: jest.fn().mockResolvedValue([]) } } as any,
      { getRates: jest.fn().mockResolvedValue({ rates: {} }) } as any,
      { compute: jest.fn().mockResolvedValue({ safeToSpendToday: null, daysRemaining: 0, incomeInferred: false }) } as any,
      { getShield: jest.fn().mockResolvedValue({ items: [] }) } as any,
      shoppingListFailing,
      { compute: jest.fn().mockResolvedValue({ status: 'no_salary_confirmed', realChangePct: null }) } as any,
      { ensureClassified: jest.fn().mockResolvedValue(undefined) } as any,
    );
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.restockNames).toEqual([]);
  });

  it('a failing real-salary call yields realChangePct: null', async () => {
    const realSalaryFailing: any = { compute: jest.fn().mockRejectedValue(new Error('down')) };
    const svc = new VoiceDigestFactsService(
      { expense: { findMany: jest.fn().mockResolvedValue([]) } } as any,
      { getRates: jest.fn().mockResolvedValue({ rates: {} }) } as any,
      { compute: jest.fn().mockResolvedValue({ safeToSpendToday: null, daysRemaining: 0, incomeInferred: false }) } as any,
      { getShield: jest.fn().mockResolvedValue({ items: [] }) } as any,
      { getRestockSuggestions: jest.fn().mockResolvedValue([]) } as any,
      realSalaryFailing,
      { ensureClassified: jest.fn().mockResolvedValue(undefined) } as any,
    );
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.realChangePct).toBeNull();
  });
});

describe('VoiceDigestFactsService.gather — SafeToSpend mapping', () => {
  it('daysToIncome is null when income was not inferred, even if daysRemaining is set', async () => {
    const { svc } = make({ safeToSpend: { safeToSpendToday: 20, daysRemaining: 12, incomeInferred: false } });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.safeToSpendToday).toBe(20);
    expect(r.daysToIncome).toBeNull();
  });

  it('daysToIncome mirrors daysRemaining when income is inferred', async () => {
    const { svc } = make({ safeToSpend: { safeToSpendToday: 20, daysRemaining: 12, incomeInferred: true } });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.daysToIncome).toBe(12);
  });
});

describe('VoiceDigestFactsService.gather — inflation shield item selection', () => {
  it('picks the largest positive monthlyChangePct item, ignoring non-positive ones', async () => {
    const { svc } = make({
      shield: {
        items: [
          { canonicalName: 'Bread', monthlyChangePct: 2 },
          { canonicalName: 'Milk', monthlyChangePct: 6 },
          { canonicalName: 'Eggs', monthlyChangePct: -1 },
          { canonicalName: 'Sugar', monthlyChangePct: 0 },
        ],
      },
    });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.shieldItem).toEqual({ name: 'Milk', monthlyChangePct: 6 });
  });

  it('returns null when no item has a positive monthlyChangePct', async () => {
    const { svc } = make({ shield: { items: [{ canonicalName: 'Bread', monthlyChangePct: -1 }] } });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.shieldItem).toBeNull();
  });
});

describe('VoiceDigestFactsService.gather — restock and real salary', () => {
  it('maps restock suggestions to their canonical names', async () => {
    const { svc } = make({ restock: [{ canonicalName: 'Milk' }, { canonicalName: 'Bread' }] });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.restockNames).toEqual(['Milk', 'Bread']);
  });

  it('reads realChangePct only when real-salary status is ready', async () => {
    const { svc } = make({ realSalary: { status: 'ready', realChangePct: -3.04 } });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.realChangePct).toBe(-3.04);
  });

  it('is null when real-salary is not ready', async () => {
    const { svc } = make({ realSalary: { status: 'spend_under_3_months', realChangePct: null } });
    const r = await svc.gather('acc', 'u1', 'PLN', NOW);
    expect(r.realChangePct).toBeNull();
  });
});

describe('VoiceDigestFactsService.gather — result shape', () => {
  it('threads baseCurrency into currency', async () => {
    const { svc } = make();
    const r = await svc.gather('acc', 'u1', 'EUR', NOW);
    expect(r.currency).toBe('EUR');
  });
});
