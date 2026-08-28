import { AiToolsService } from './ai-tools.service';

/**
 * Asking the chat "how much did I spend on deposits this month" answered
 * "nothing" while the receipt in front of the user carried a 4.50 Kaucja
 * split. The model called `get_expenses` with `categoryName`, and that tool
 * resolved the name to a `categoryId` and pushed it into the SQL filter — so
 * it matched only an expense's OWN category. A category that exists purely as
 * a receipt SPLIT (deposits, alcohol, household) can never match that way.
 *
 * `get_category_breakdown` was already fixed for exactly this reason; the two
 * tools answer the same kind of question and must agree. Budgets and
 * `get_budget_status` stay deliberately split-blind (design spec, locked
 * decision 1).
 */
function makeService(expenses: any[], categories: any[]) {
  const expensesService = { findAll: jest.fn().mockResolvedValue({ data: expenses, pagination: { total: expenses.length } }) };
  const categoriesService = { findAll: jest.fn().mockResolvedValue(categories) };

  const svc = new AiToolsService(
    expensesService as any,
    undefined as any, // incomesService
    undefined as any, // budgetsService
    categoriesService as any,
    undefined as any, // analyticsService
    undefined as any, // cacheService
    undefined as any, // debtsService
    undefined as any, // goalPlannerService
    undefined as any, // exchangeRateService
    undefined as any, // safeToSpendService
    undefined as any, // shoppingListService
    undefined as any, // inflationShieldService
  );
  return { svc, expensesService };
}

const CATEGORIES = [
  { id: 'c-food', name: 'Groceries' },
  { id: 'c-dep', name: 'Kaucja' },
  { id: 'c-beer', name: 'Piwo' },
];

/** The real production receipt: 233.98 total, of which 4.50 is the deposit. */
const receipt = {
  id: 'e-1',
  amount: 233.98,
  currencyCode: 'PLN',
  date: '2026-08-27',
  merchant: 'Biedronka',
  category: { id: 'c-food', name: 'Groceries' },
  categorySplits: [
    { categoryId: 'c-food', amount: 179.14, category: { id: 'c-food', name: 'Groceries' } },
    { categoryId: 'c-beer', amount: 50.34, category: { id: 'c-beer', name: 'Piwo' } },
    { categoryId: 'c-dep', amount: 4.5, category: { id: 'c-dep', name: 'Kaucja' } },
  ],
};

/** An expense whose own category is the deposit one, with no splits at all. */
const plainDeposit = {
  id: 'e-2',
  amount: 2,
  currencyCode: 'PLN',
  date: '2026-08-20',
  category: { id: 'c-dep', name: 'Kaucja' },
};

/** A receipt with splits, none of them the deposit category. */
const otherReceipt = {
  id: 'e-3',
  amount: 90,
  currencyCode: 'PLN',
  date: '2026-08-15',
  category: { id: 'c-food', name: 'Groceries' },
  categorySplits: [
    { categoryId: 'c-food', amount: 70, category: { id: 'c-food', name: 'Groceries' } },
    { categoryId: 'c-beer', amount: 20, category: { id: 'c-beer', name: 'Piwo' } },
  ],
};

const run = (svc: AiToolsService, args: Record<string, unknown>) =>
  (svc as any).executeAction('get_expenses', { startDate: '2026-08-01', endDate: '2026-08-31', ...args }, 'a1', 'u1');

describe('get_expenses with a categoryName that only exists as a receipt split', () => {
  it('finds the receipt whose deposit lives in a split', async () => {
    const { svc } = makeService([receipt, otherReceipt], CATEGORIES);

    const res = await run(svc, { categoryName: 'Kaucja' });

    expect(res.data.recentExpenses.map((e: any) => e.id)).toEqual(['e-1']);
  });

  it('reports the split amount, not the whole receipt', async () => {
    // The failure mode worth guarding: answering "233.98 on deposits" is worse
    // than answering "nothing".
    const { svc } = makeService([receipt], CATEGORIES);

    const res = await run(svc, { categoryName: 'Kaucja' });

    expect(res.data.recentExpenses[0].amount).toBe(4.5);
    expect(res.data.totalsByCurrency.PLN).toBe(4.5);
  });

  it('counts only the matching expenses, not the whole period', async () => {
    const { svc } = makeService([receipt, otherReceipt, plainDeposit], CATEGORIES);

    const res = await run(svc, { categoryName: 'Kaucja' });

    expect(res.data.count).toBe(2);
    expect(res.data.totalsByCurrency.PLN).toBe(6.5);
  });

  it('still matches an expense that carries the category itself, with no splits', async () => {
    const { svc } = makeService([plainDeposit], CATEGORIES);

    const res = await run(svc, { categoryName: 'Kaucja' });

    expect(res.data.recentExpenses[0].amount).toBe(2);
  });

  it('excludes a split receipt when none of its splits is the asked-for category', async () => {
    // Splits decide whenever they exist — the same single rule
    // get_category_breakdown applies — so a Groceries receipt split into
    // Groceries/Piwo does not answer a Kaucja question.
    const { svc } = makeService([otherReceipt], CATEGORIES);

    const res = await run(svc, { categoryName: 'Kaucja' });

    expect(res.data.recentExpenses).toEqual([]);
    expect(res.data.count).toBe(0);
  });

  it('leaves the period untouched when the name matches no category at all', async () => {
    const { svc } = makeService([receipt, otherReceipt], CATEGORIES);

    const res = await run(svc, { categoryName: 'Nonexistent' });

    expect(res.data.recentExpenses).toHaveLength(2);
    expect(res.data.totalsByCurrency.PLN).toBe(323.98);
  });

  it('breaks an unfiltered period down per split, so chat and the Analytics tab agree', async () => {
    const { svc } = makeService([receipt], CATEGORIES);

    const res = await run(svc, {});
    const byName = Object.fromEntries(res.data.categoryTotals.map((c: any) => [c.category, c.amount]));

    expect(byName).toEqual({ Groceries: 179.14, Piwo: 50.34, Kaucja: 4.5 });
    // The period total is still what was actually paid.
    expect(res.data.totalsByCurrency.PLN).toBe(233.98);
  });
});
