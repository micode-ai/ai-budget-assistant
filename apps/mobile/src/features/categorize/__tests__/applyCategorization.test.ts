import { applyCategorization, resolveLocalExpenseId } from '../applyCategorization';
import type { ApplyPlan } from '../categorizeReview';

const ref = (id: string, clientId: string | null = null) => ({
  id, clientId, merchant: null, description: null, amount: 1, currencyCode: 'PLN', date: '2026-09-20',
});

describe('resolveLocalExpenseId', () => {
  const local = [{ id: 'local-1', serverId: 'srv-1' }, { id: 'srv-2' }, { id: 'local-3' }];
  it('finds a row by serverId, by id, and by clientId', () => {
    expect(resolveLocalExpenseId(ref('srv-1'), local)).toBe('local-1');
    expect(resolveLocalExpenseId(ref('srv-2'), local)).toBe('srv-2');
    expect(resolveLocalExpenseId(ref('srv-3', 'local-3'), local)).toBe('local-3');
  });
  it('falls back to the server id for a row the client does not hold', () => {
    expect(resolveLocalExpenseId(ref('srv-9'), local)).toBe('srv-9');
  });
});

describe('applyCategorization', () => {
  const plan: ApplyPlan = {
    newCategories: [{ draftKey: 'p0', name: 'Materiały' }],
    assignments: [
      { target: { kind: 'new', draftKey: 'p0' }, expenseIds: ['srv-1', 'srv-2'] },
      { target: { kind: 'existing', categoryId: 'tax' }, expenseIds: ['srv-9'] },
    ],
    expenseCount: 3,
  };

  it('creates categories before assigning, and assigns by local id', async () => {
    const calls: string[] = [];
    const deps = {
      createCategory: jest.fn(async (name: string) => { calls.push(`create:${name}`); return { id: 'new-cat' }; }),
      bulkSetCategory: jest.fn(async (ids: string[], cat: string) => { calls.push(`bulk:${cat}:${ids.join(',')}`); }),
      localExpenses: [{ id: 'local-1', serverId: 'srv-1' }, { id: 'srv-2' }],
    };
    const r = await applyCategorization(plan, [ref('srv-1'), ref('srv-2'), ref('srv-9')], deps);
    expect(calls).toEqual(['create:Materiały', 'bulk:new-cat:local-1,srv-2', 'bulk:tax:srv-9']);
    expect(r).toEqual({ categorized: 3, created: 1 });
  });

  it('counts an existing category returned for a draft name as not created', async () => {
    // categoryStore.createCategory returns the existing row when the name is taken.
    const deps = {
      createCategory: jest.fn(async () => ({ id: 'tax' })),
      bulkSetCategory: jest.fn(async () => undefined),
      localExpenses: [],
    };
    const r = await applyCategorization(
      { newCategories: [{ draftKey: 'p0', name: 'Tax' }], assignments: [{ target: { kind: 'new', draftKey: 'p0' }, expenseIds: ['srv-1'] }], expenseCount: 1 },
      [ref('srv-1')],
      { ...deps, existingCategoryIds: new Set(['tax']) },
    );
    expect(deps.createCategory).toHaveBeenCalledTimes(1);
    expect(r.created).toBe(0);
  });

  it('does nothing for an empty plan', async () => {
    const deps = { createCategory: jest.fn(), bulkSetCategory: jest.fn(), localExpenses: [] };
    const r = await applyCategorization({ newCategories: [], assignments: [], expenseCount: 0 }, [], deps as any);
    expect(deps.createCategory).not.toHaveBeenCalled();
    expect(r).toEqual({ categorized: 0, created: 0 });
  });

  // ABA-589 F2: on web there's no SQLite fallback, so the review's try/catch is
  // the only thing that can tell the user a server write failed — it only fires
  // if bulkSetCategory's rejection actually propagates out of applyCategorization.
  it('propagates a rejecting bulkSetCategory so the caller\'s catch fires', async () => {
    const deps = {
      createCategory: jest.fn(async () => ({ id: 'new-cat' })),
      bulkSetCategory: jest.fn(async () => { throw new Error('server rejected the write'); }),
      localExpenses: [],
    };
    await expect(applyCategorization(plan, [ref('srv-1'), ref('srv-2'), ref('srv-9')], deps)).rejects.toThrow(
      'server rejected the write',
    );
  });
});
