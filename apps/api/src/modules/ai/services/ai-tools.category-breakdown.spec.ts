import { AiToolsService } from './ai-tools.service';

/**
 * `get_category_breakdown` is an ANALYTICS surface, so it must attribute a
 * receipt's category splits the same way `analytics.service.ts:218` does.
 * Grouping strictly by `expense.categoryId` made the chat answer "0" for
 * alcohol while the Analytics tab showed 25 zł for the same period — the app
 * contradicting its own chart. Budgets and `get_budget_status` stay
 * deliberately split-blind (design spec, locked decision 1).
 */
function makeService(expenses: any[], rates?: Record<string, number>) {
  const expensesService = {
    findAll: jest.fn().mockResolvedValue({ data: expenses }),
  };
  const exchangeRateService = rates
    ? { getRates: jest.fn().mockResolvedValue({ rates }) }
    : undefined;

  const svc = new AiToolsService(
    expensesService as any,
    undefined as any, // incomesService
    undefined as any, // budgetsService
    undefined as any, // categoriesService
    undefined as any, // analyticsService
    undefined as any, // cacheService
    undefined as any, // debtsService
    undefined as any, // goalPlannerService
    exchangeRateService as any,
    undefined as any, // safeToSpendService
    undefined as any, // shoppingListService
    undefined as any, // inflationShieldService
  );
  return { svc, expensesService };
}

const run = (svc: AiToolsService, baseCurrency?: string) =>
  (svc as any).executeAction(
    'get_category_breakdown',
    { startDate: '2026-08-01', endDate: '2026-08-31' },
    'a1',
    'u1',
    baseCurrency,
  );

/** A 240 zł shop split 180 groceries / 35 household / 25 alcohol. */
const splitReceipt = {
  id: 'e-1',
  amount: 240,
  currencyCode: 'PLN',
  category: { id: 'c-food', name: 'Groceries' },
  categorySplits: [
    { categoryId: 'c-food', amount: 180, category: { id: 'c-food', name: 'Groceries' } },
    { categoryId: 'c-home', amount: 35, category: { id: 'c-home', name: 'Household' } },
    { categoryId: 'c-alc', amount: 25, category: { id: 'c-alc', name: 'Alcohol' } },
  ],
};

const plainExpense = {
  id: 'e-2',
  amount: 60,
  currencyCode: 'PLN',
  category: { id: 'c-transport', name: 'Transport' },
  categorySplits: [],
};

describe('AiToolsService get_category_breakdown honours category splits', () => {
  it('attributes each split to its own category instead of the expense category', async () => {
    const { svc } = makeService([splitReceipt]);

    const res = await run(svc);
    const categories = (res.data as any).categories as any[];

    expect(res.success).toBe(true);
    expect(categories.map((c) => [c.categoryName, c.amount])).toEqual([
      ['Groceries', 180],
      ['Household', 35],
      ['Alcohol', 25],
    ]);
    // The whole point: asking about alcohol no longer answers 0.
    expect(categories.find((c) => c.categoryName === 'Alcohol').categoryId).toBe('c-alc');
  });

  it('still reports the period total from the expense amounts, not the split rows', async () => {
    const { svc } = makeService([splitReceipt, plainExpense]);

    const res = await run(svc);

    expect((res.data as any).totalExpenses).toBe(300);
    expect((res.data as any).expensesByCurrency).toEqual({ PLN: 300 });
  });

  it('falls back to the expense category when an expense has no splits', async () => {
    const { svc } = makeService([plainExpense]);

    const res = await run(svc);
    const categories = (res.data as any).categories as any[];

    expect(categories).toEqual([
      expect.objectContaining({ categoryName: 'Transport', amount: 60, count: 1 }),
    ]);
  });

  it('percentages of a split receipt still add up to 100', async () => {
    const { svc } = makeService([splitReceipt]);

    const res = await run(svc);
    const categories = (res.data as any).categories as any[];

    expect(categories.reduce((sum, c) => sum + c.percentage, 0)).toBeCloseTo(100, 5);
  });

  it('converts split amounts into the display currency exactly like expense amounts', async () => {
    // Rates are quoted as "1 base = rates[X] X", so PLN amounts are divided by 4.
    const { svc } = makeService([splitReceipt], { PLN: 4, USD: 1 });

    const res = await run(svc, 'USD');
    const data = res.data as any;
    const categories = data.categories as any[];

    expect(data.fxConverted).toBe(true);
    expect(data.fxApproximate).toBe(true);
    expect(data.baseCurrency).toBe('USD');
    expect(categories.map((c) => [c.categoryName, c.amount])).toEqual([
      ['Groceries', 45],
      ['Household', 8.75],
      ['Alcohol', 6.25],
    ]);
    expect(categories.every((c) => c.currencyCode === 'USD')).toBe(true);
    expect(data.totalExpenses).toBe(60);
    // Native per-currency totals stay native, for transparency.
    expect(data.expensesByCurrency).toEqual({ PLN: 240 });
  });

  it('leaves amounts native and unflagged when no rate is available', async () => {
    const { svc } = makeService([splitReceipt]);

    const res = await run(svc, 'USD');
    const data = res.data as any;

    expect(data.fxConverted).toBeUndefined();
    expect((data.categories as any[]).map((c) => c.amount)).toEqual([180, 35, 25]);
    expect((data.categories as any[]).every((c) => c.currencyCode === undefined)).toBe(true);
  });
});
