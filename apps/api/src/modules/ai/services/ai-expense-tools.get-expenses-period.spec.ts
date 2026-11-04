import { AiExpenseToolsService } from './ai-expense-tools.service';

/**
 * "Сколько за всё время было потрачено на ремонт" answered 5.70 PLN — November
 * only — while the category held 37k PLN across three months. The model mapped
 * the question to `categoryName` and sent no dates, and `get_expenses` defaulted
 * a dateless, keywordless call to the CURRENT MONTH. A named category with no
 * period is a lifetime question for the same reason a product keyword is.
 *
 * And because the category filter runs in memory (splits must match too), a
 * single 500-row page could cut a lifetime answer short: the category path now
 * reads every page, up to a cap.
 */
const CATEGORIES = [{ id: 'c-build', name: 'Building supplies' }, { id: 'c-food', name: 'Groceries' }];

const exp = (i: number, categoryId: string, name: string, amount = 10) => ({
  id: `e-${i}`,
  amount,
  currencyCode: 'PLN',
  date: '2026-09-01',
  category: { id: categoryId, name },
});

/** findAll mock that serves `all` in pages of the requested size. */
function makeService(all: any[]) {
  const expensesService = {
    findAll: jest.fn(async (_accountId: string, filters: { page?: number; limit?: number; startDate?: string }) => {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      return {
        data: all.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
      };
    }),
  };
  const categoriesService = { findAll: jest.fn().mockResolvedValue(CATEGORIES) };
  const svc = new AiExpenseToolsService(
    expensesService as any,
    undefined as any,
    categoriesService as any,
    undefined as any,
    undefined as any,
  );
  return { svc, expensesService };
}

const run = (svc: AiExpenseToolsService, args: Record<string, unknown>) =>
  (svc as any).executeGetExpenses(args, 'a1');

const firstMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

describe('AiExpenseToolsService.executeGetExpenses default period', () => {
  it('searches the full history when a category is named without a period', async () => {
    const { svc, expensesService } = makeService([exp(1, 'c-build', 'Building supplies')]);

    const res = await run(svc, { categoryName: 'Building supplies' });

    expect(expensesService.findAll.mock.calls[0][1].startDate).toBe('2000-01-01');
    expect(res.data.startDate).toBe('2000-01-01');
  });

  it('keeps the current month when nothing narrows the question', async () => {
    const { svc, expensesService } = makeService([]);

    await run(svc, {});

    expect(expensesService.findAll.mock.calls[0][1].startDate).toBe(firstMonth());
  });

  it('keeps the current month when the category name matches nothing', async () => {
    const { svc, expensesService } = makeService([]);

    await run(svc, { categoryName: 'No such category' });

    expect(expensesService.findAll.mock.calls[0][1].startDate).toBe(firstMonth());
  });

  it('respects an explicit startDate with a category', async () => {
    const { svc, expensesService } = makeService([]);

    await run(svc, { categoryName: 'Building supplies', startDate: '2026-10-01' });

    expect(expensesService.findAll.mock.calls[0][1].startDate).toBe('2026-10-01');
  });
});

describe('AiExpenseToolsService.executeGetExpenses category filter paging', () => {
  it('reads past the first page so an older match is still counted', async () => {
    // 500 newest are groceries; the one building-supplies expense is the 501st.
    const all = [
      ...Array.from({ length: 500 }, (_, i) => exp(i, 'c-food', 'Groceries')),
      exp(500, 'c-build', 'Building supplies', 37),
    ];
    const { svc, expensesService } = makeService(all);

    const res = await run(svc, { categoryName: 'Building supplies' });

    expect(expensesService.findAll).toHaveBeenCalledTimes(2);
    expect(res.data.count).toBe(1);
    expect(res.data.totalsByCurrency.PLN).toBe(37);
  });

  it('reads a single page when there is no category filter', async () => {
    const all = Array.from({ length: 600 }, (_, i) => exp(i, 'c-food', 'Groceries'));
    const { svc, expensesService } = makeService(all);

    await run(svc, { startDate: '2000-01-01' });

    expect(expensesService.findAll).toHaveBeenCalledTimes(1);
  });

  it('stops at the scan cap instead of reading an unbounded history', async () => {
    const all = Array.from({ length: 6000 }, (_, i) => exp(i, 'c-build', 'Building supplies', 1));
    const { svc, expensesService } = makeService(all);

    const res = await run(svc, { categoryName: 'Building supplies' });

    expect(expensesService.findAll).toHaveBeenCalledTimes(10);
    expect(res.data.count).toBe(5000);
  });
});
