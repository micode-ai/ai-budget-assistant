import { CategorizeIncomeSuggestionsService } from './categorize-income-suggestions.service';

function income(id: string, description = 'x', source = 'manual') {
  return {
    id,
    clientId: `local-${id}`,
    description,
    amount: { toString: () => '10.50' },
    currencyCode: 'PLN',
    date: new Date('2026-09-20T00:00:00Z'),
    source,
  };
}

function makeService(opts: {
  candidates: ReturnType<typeof income>[];
  categories?: Array<{ id: string; name: string }>;
  used?: number;
  modelAnswer?: unknown;
  modelThrows?: boolean;
}) {
  const prisma: any = {
    income: {
      findMany: jest.fn().mockResolvedValue(opts.candidates),
      count: jest.fn().mockResolvedValue(0),
    },
    category: { findMany: jest.fn().mockResolvedValue(opts.categories ?? [{ id: 'c-salary', name: 'Salary' }]) },
    account: { findUnique: jest.fn().mockResolvedValue({ name: 'House' }) },
    accountMember: { findFirst: jest.fn().mockResolvedValue({ user: { language: 'pl' } }) },
  };
  // Keyed like Redis: the daily counter reads `used`, everything else reads back what was set.
  const store = new Map<string, unknown>();
  const cache: any = {
    get: jest.fn(async (key: string) => (key.startsWith('aicat:') ? (opts.used ?? 0) : store.get(key) ?? null)),
    set: jest.fn(async (key: string, value: unknown) => { store.set(key, value); }),
  };
  const config: any = { get: () => 'test-key' };
  const service = new CategorizeIncomeSuggestionsService(config, prisma, cache);
  const create = opts.modelThrows
    ? jest.fn().mockRejectedValue(new Error('openai down'))
    : jest.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(opts.modelAnswer ?? {}) } }],
      });
  (service as any).openai = { chat: { completions: { create } } };
  return { service, prisma, cache, create };
}

describe('CategorizeIncomeSuggestionsService.suggest', () => {
  it('returns an empty response without calling the model when nothing is uncategorized', async () => {
    const { service, create } = makeService({ candidates: [] });
    const r = await service.suggest('acc');
    expect(r.incomes).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('queries only real, readable, uncategorized incomes of the account (no merchant/items fields)', async () => {
    const { service, prisma } = makeService({ candidates: [] });
    await service.suggest('acc');
    const call = prisma.income.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      accountId: 'acc',
      categoryId: null,
      isDeleted: false,
      isDebt: false,
      isDebtRepayment: false,
      encryptedPayload: null,
    });
    expect(call.take).toBe(100);
    expect(call.orderBy).toEqual({ date: 'desc' });
    expect(call.select).not.toHaveProperty('items');
    expect(call.select).not.toHaveProperty('merchant');
    expect(call.select).toHaveProperty('source');
  });

  it('turns model output into groups and counts the pass, without any merchant top-up', async () => {
    const { service, cache } = makeService({
      candidates: [income('i1'), income('i2'), income('i3', 'consulting gig')],
      modelAnswer: {
        assignments: [{ index: 2, categoryName: 'Salary' }],
        newCategories: [{ name: 'Freelance', indexes: [0, 1] }],
      },
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([
      { categoryId: 'c-salary', proposedName: null, expenseIds: ['i3'] },
      { categoryId: null, proposedName: 'Freelance', expenseIds: ['i1', 'i2'] },
    ]);
    expect(r.unassigned).toEqual([]);
    expect(r.incomes[0]).toEqual({
      id: 'i1', clientId: 'local-i1', description: 'x',
      amount: 10.5, currencyCode: 'PLN', date: '2026-09-20', source: 'manual',
    });
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^aicat:acc:\d{4}-\d{2}-\d{2}$/), 1, 86400);
    expect(r.remainingToday).toBe(4);
  });

  it('shares the SAME daily counter key as the expense categorize pass', async () => {
    const { service, cache } = makeService({ candidates: [income('i1')], modelAnswer: {} });
    await service.suggest('my-account');
    const quotaKey = cache.set.mock.calls.find((c: any[]) => String(c[0]).startsWith('aicat:'))?.[0];
    expect(quotaKey).toBe(`aicat:my-account:${new Date().toISOString().slice(0, 10)}`);
  });

  it('skips the model at the shared daily ceiling and still returns an (empty) response, never a hard error', async () => {
    const { service, create } = makeService({ candidates: [income('i1')], used: 5 });
    const r = await service.suggest('acc');
    expect(create).not.toHaveBeenCalled();
    expect(r.limitReached).toBe(true);
    expect(r.remainingToday).toBe(0);
    expect(r.unassigned).toEqual(['i1']);
  });

  it('does not spend a pass when the model throws', async () => {
    const { service, cache } = makeService({ candidates: [income('i1')], modelThrows: true });
    const r = await service.suggest('acc');
    expect(cache.set).not.toHaveBeenCalled();
    expect(r.unassigned).toEqual(['i1']);
  });

  it('asks the model deterministically and without a "Standard category names" line', async () => {
    const { service, create } = makeService({ candidates: [income('i1')], modelAnswer: {} });
    await service.suggest('acc');
    expect(create.mock.calls[0][0].temperature).toBe(0);
    const prompt: string = create.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain('Standard category names');
    expect(prompt).not.toContain('merchant=');
  });

  it('reuses the model answer for the same input without spending another pass, under its own result-cache namespace', async () => {
    const { service, create, cache } = makeService({
      candidates: [income('i1'), income('i2')],
      modelAnswer: { newCategories: [{ name: 'Freelance', indexes: [0, 1] }] },
    });
    const first = await service.suggest('acc');
    const second = await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.groups).toEqual(first.groups);

    const resultCacheKeys = [...cache.set.mock.calls.map((c: any[]) => String(c[0]))].filter(
      (k) => !k.startsWith('aicat:'),
    );
    expect(resultCacheKeys).toHaveLength(1);
    expect(resultCacheKeys[0]).toMatch(/^aicatinc:acc:/);
    // Never the expense service's own result-cache prefix.
    expect(resultCacheKeys[0]).not.toMatch(/^aicatres:/);
  });

  it('asks again once the candidates change', async () => {
    const { service, create, prisma } = makeService({
      candidates: [income('i1'), income('i2')],
      modelAnswer: {},
    });
    await service.suggest('acc');
    prisma.income.findMany.mockResolvedValue([income('i1')]);
    await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('reuses the shared validateCategorization rules: an assignment to an existing category wins a contested index', async () => {
    const { service } = makeService({
      candidates: [income('i1'), income('i2')],
      categories: [{ id: 'c-salary', name: 'Salary' }],
      modelAnswer: {
        assignments: [{ index: 0, categoryName: 'Salary' }],
        newCategories: [{ name: 'Other income', indexes: [0, 1] }],
      },
    });
    const r = await service.suggest('acc');
    // index 0 goes to the existing "Salary" assignment; only index 1 is left,
    // which is below MIN_EXPENSES_PER_NEW_CATEGORY (2) so the proposal is dropped.
    expect(r.groups).toEqual([{ categoryId: 'c-salary', proposedName: null, expenseIds: ['i1'] }]);
    expect(r.unassigned).toEqual(['i2']);
  });
});
