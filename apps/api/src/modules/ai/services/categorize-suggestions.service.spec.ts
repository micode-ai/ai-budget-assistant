import { CategorizeSuggestionsService } from './categorize-suggestions.service';

function expense(id: string, merchant: string | null, description = 'x') {
  return {
    id,
    clientId: `local-${id}`,
    merchant,
    description,
    amount: { toString: () => '10.50' },
    currencyCode: 'PLN',
    date: new Date('2026-09-20T00:00:00Z'),
    items: [],
  };
}

function makeService(opts: {
  candidates: ReturnType<typeof expense>[];
  categories?: Array<{ id: string; name: string }>;
  rules?: Map<string, string>;
  used?: number;
  modelAnswer?: unknown;
  modelThrows?: boolean;
}) {
  const prisma: any = {
    expense: {
      findMany: jest.fn().mockResolvedValue(opts.candidates),
      count: jest.fn().mockResolvedValue(0),
    },
    category: { findMany: jest.fn().mockResolvedValue(opts.categories ?? [{ id: 'c-tax', name: 'Tax' }]) },
    account: { findUnique: jest.fn().mockResolvedValue({ name: 'House' }) },
    accountMember: { findFirst: jest.fn().mockResolvedValue({ user: { language: 'pl' } }) },
  };
  // Keyed like Redis: the daily counter reads `used`, everything else reads back what was set.
  const store = new Map<string, unknown>();
  const cache: any = {
    get: jest.fn(async (key: string) => (key.startsWith('aicat:') ? (opts.used ?? 0) : store.get(key) ?? null)),
    set: jest.fn(async (key: string, value: unknown) => { store.set(key, value); }),
  };
  const merchantRules: any = { getRulesMap: jest.fn().mockResolvedValue(opts.rules ?? new Map()) };
  const config: any = { get: () => 'test-key' };
  const service = new CategorizeSuggestionsService(config, prisma, cache, merchantRules);
  const create = opts.modelThrows
    ? jest.fn().mockRejectedValue(new Error('openai down'))
    : jest.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(opts.modelAnswer ?? {}) } }],
      });
  (service as any).openai = { chat: { completions: { create } } };
  return { service, prisma, cache, create };
}

describe('CategorizeSuggestionsService.suggest', () => {
  it('returns an empty response without calling the model when nothing is uncategorized', async () => {
    const { service, create } = makeService({ candidates: [] });
    const r = await service.suggest('acc');
    expect(r.expenses).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('resolves by merchant rule without calling the model or spending a pass', async () => {
    const { service, create, cache } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', ' obi ')],
      rules: new Map([['obi', 'c-tax']]),
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([{ categoryId: 'c-tax', proposedName: null, expenseIds: ['e1', 'e2'] }]);
    expect(create).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('ignores a rule pointing at a category the account no longer has', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'OBI')],
      rules: new Map([['obi', 'c-deleted']]),
      modelAnswer: {},
    });
    await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('turns model output into groups and counts the pass', async () => {
    const { service, cache } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama'), expense('e3', null, 'Tax imns')],
      modelAnswer: {
        assignments: [{ index: 2, categoryName: 'Tax' }],
        newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1] }],
      },
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([
      { categoryId: 'c-tax', proposedName: null, expenseIds: ['e3'] },
      { categoryId: null, proposedName: 'Materiały budowlane', expenseIds: ['e1', 'e2'] },
    ]);
    expect(r.unassigned).toEqual([]);
    expect(r.expenses[0]).toEqual({
      id: 'e1', clientId: 'local-e1', merchant: 'OBI', description: 'x',
      amount: 10.5, currencyCode: 'PLN', date: '2026-09-20',
    });
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^aicat:acc:\d{4}-\d{2}-\d{2}$/), 1, 86400);
    expect(r.remainingToday).toBe(4);
  });

  it('keeps the deposit category out of the prompt and the valid names', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'Biedronka')],
      categories: [{ id: 'c-tax', name: 'Tax' }, { id: 'c-dep', name: 'Kaucja' }],
      modelAnswer: { assignments: [{ index: 0, categoryName: 'Kaucja' }] },
    });
    const r = await service.suggest('acc');
    const prompt: string = create.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain('Kaucja');
    expect(r.unassigned).toEqual(['e1']);
  });

  it('offers the owner-language default category names as fill-ins, excluding ones that already exist', async () => {
    // pl default list (default-categories.ts): includes both 'Transport' and
    // 'Zakupy spożywcze' (Groceries). The account already has 'Transport', so
    // it must not be re-offered as a "standard" name, but 'Zakupy spożywcze'
    // (unrelated to any existing category) must be.
    const { service, create } = makeService({
      candidates: [expense('e1', 'Zabka')],
      categories: [{ id: 'c-transport', name: 'Transport' }],
      modelAnswer: {},
    });
    await service.suggest('acc');
    const prompt: string = create.mock.calls[0][0].messages[0].content;
    const standardLine = prompt.split('\n').find((l) => l.startsWith('Standard category names'));
    expect(standardLine).toBeDefined();
    expect(standardLine).toContain('Zakupy spożywcze');
    expect(standardLine).not.toContain('Transport');
  });

  it('does not spend a pass when the model throws', async () => {
    const { service, cache } = makeService({ candidates: [expense('e1', 'OBI')], modelThrows: true });
    const r = await service.suggest('acc');
    expect(cache.set).not.toHaveBeenCalled();
    expect(r.unassigned).toEqual(['e1']);
  });

  it('skips the model at the daily ceiling but still returns rule groups', async () => {
    const { service, create } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama')],
      rules: new Map([['obi', 'c-tax']]),
      used: 5,
    });
    const r = await service.suggest('acc');
    expect(create).not.toHaveBeenCalled();
    expect(r.limitReached).toBe(true);
    expect(r.groups).toEqual([{ categoryId: 'c-tax', proposedName: null, expenseIds: ['e1'] }]);
    expect(r.unassigned).toEqual(['e2']);
    expect(r.remainingToday).toBe(0);
  });

  it('queries only real, readable, uncategorized expenses of the account', async () => {
    const { service, prisma } = makeService({ candidates: [] });
    await service.suggest('acc');
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      accountId: 'acc',
      categoryId: null,
      isDeleted: false,
      isPlanned: false,
      isSplitReceivable: false,
      isDebt: false,
      encryptedPayload: null,
    });
    expect(prisma.expense.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('asks the model deterministically', async () => {
    const { service, create } = makeService({ candidates: [expense('e1', 'OBI')], modelAnswer: {} });
    await service.suggest('acc');
    expect(create.mock.calls[0][0].temperature).toBe(0);
  });

  it('reuses the model answer for the same input without spending another pass', async () => {
    const { service, create, cache } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama')],
      modelAnswer: { newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1] }] },
    });
    const first = await service.suggest('acc');
    const second = await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.groups).toEqual(first.groups);
    const quotaWrites = cache.set.mock.calls.filter((c: any[]) => String(c[0]).startsWith('aicat:'));
    expect(quotaWrites).toHaveLength(1);
  });

  it('asks again once the candidates change', async () => {
    const { service, create, prisma } = makeService({
      candidates: [expense('e1', 'OBI'), expense('e2', 'Castorama')],
      modelAnswer: {},
    });
    await service.suggest('acc');
    prisma.expense.findMany.mockResolvedValue([expense('e1', 'OBI')]);
    await service.suggest('acc');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('adds a store variant the model left out to the group holding that store', async () => {
    const { service } = makeService({
      candidates: [expense('e1', 'Leroy Merlin'), expense('e2', 'OBI'), expense('e3', 'LEROY MERLIN GDYNIA')],
      modelAnswer: { newCategories: [{ name: 'Materiały budowlane', indexes: [0, 1] }] },
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([{ categoryId: null, proposedName: 'Materiały budowlane', expenseIds: ['e1', 'e2', 'e3'] }]);
    expect(r.unassigned).toEqual([]);
  });

  it('tops up rule groups too when the model is unavailable', async () => {
    const { service } = makeService({
      candidates: [expense('e1', 'Leroy Merlin'), expense('e2', 'Leroy Merlin Gdańsk')],
      rules: new Map([['leroy merlin', 'c-tax']]),
      modelThrows: true,
    });
    const r = await service.suggest('acc');
    expect(r.groups).toEqual([{ categoryId: 'c-tax', proposedName: null, expenseIds: ['e1', 'e2'] }]);
  });
});
