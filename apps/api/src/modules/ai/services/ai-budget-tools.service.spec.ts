import { AiBudgetToolsService } from './ai-budget-tools.service';

function makeService(budgets: unknown[] = []) {
  const budgetsService: any = {
    create: jest.fn().mockImplementation(async (_a: string, _u: string, dto: any) => ({
      id: 'b-1', name: dto.name, amount: dto.amount, currencyCode: dto.currencyCode, period: dto.period,
    })),
    findAll: jest.fn().mockResolvedValue(budgets),
    getAccountAnchorDay: jest.fn().mockResolvedValue(null),
    getProgress: jest.fn().mockResolvedValue({
      spent: 40, remaining: 60, overBy: 0, percentageUsed: 40, isOverBudget: false, daysRemaining: 10,
    }),
  };
  const categoriesService: any = {
    findAll: jest.fn().mockResolvedValue([{ id: 'cat-food', name: 'Food' }, { id: 'cat-fun', name: 'Fun' }]),
  };
  const exchangeRateService: any = { getRates: jest.fn() };
  const service = new AiBudgetToolsService(budgetsService, categoriesService, exchangeRateService);
  return { service, budgetsService };
}

const baseArgs = { name: 'Groceries', amount: 500, currencyCode: 'PLN', period: 'monthly', startDate: '2026-10-01' };

describe('AiBudgetToolsService.executeCreateBudget', () => {
  it('turns categoryName into a single category allocation of the full amount', async () => {
    const { service, budgetsService } = makeService();
    const res = await service.executeCreateBudget({ ...baseArgs, categoryName: 'food' }, 'acc-1', 'u-1');

    expect(res.success).toBe(true);
    const dto = budgetsService.create.mock.calls[0][2];
    expect(dto.categories).toEqual([{ categoryId: 'cat-food', amount: 500 }]);
    expect(dto).not.toHaveProperty('categoryId');
  });

  it('fails instead of creating an all-spend budget when the category does not exist', async () => {
    const { service, budgetsService } = makeService();
    const res = await service.executeCreateBudget({ ...baseArgs, categoryName: 'Travel' }, 'acc-1', 'u-1');

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('Travel');
    expect(budgetsService.create).not.toHaveBeenCalled();
  });

  it('creates an overall budget when no category is named', async () => {
    const { service, budgetsService } = makeService();
    await service.executeCreateBudget(baseArgs, 'acc-1', 'u-1');
    expect(budgetsService.create.mock.calls[0][2].categories).toBeUndefined();
  });
});

describe('AiBudgetToolsService.executeGetBudgetStatus', () => {
  const budgets = [
    { id: 'b-food', name: 'Monthly food', amount: 100, currencyCode: 'PLN', period: 'monthly',
      categoryAllocations: [{ category: { name: 'Food' } }] },
    { id: 'b-all', name: 'Everything', amount: 3000, currencyCode: 'PLN', period: 'monthly', categoryAllocations: [] },
  ];

  it('filters by the categories a budget allocates to', async () => {
    const { service } = makeService(budgets);
    const res = await service.executeGetBudgetStatus({ categoryName: 'foo' }, 'acc-1');

    const data = res.data as any;
    expect(data.count).toBe(1);
    expect(data.budgets[0].name).toBe('Monthly food');
    expect(data.budgets[0].categories).toEqual(['Food']);
  });

  it('lists every budget, with empty categories for an overall one, when no filter is given', async () => {
    const { service } = makeService(budgets);
    const data = (await service.executeGetBudgetStatus({}, 'acc-1')).data as any;
    expect(data.count).toBe(2);
    expect(data.budgets[1].categories).toEqual([]);
  });
});
