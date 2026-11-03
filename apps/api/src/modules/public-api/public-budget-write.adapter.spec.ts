import { PublicApiError } from './public-api-error';
import {
  PublicBudgetWriteAdapter,
  toInternalBudgetCreateDto,
  toInternalBudgetUpdateDto,
} from './public-budget-write.adapter';
import type { PublicWriteContext } from './public-write.shared';

const KEY = '7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6';
const CTX: PublicWriteContext = { accountId: 'acc-1', userId: 'user-1', clientDbId: 'client-db-1' };
const CAT = '11111111-1111-4111-8111-111111111111';
const CAT2 = '22222222-2222-4222-8222-222222222222';
const BODY = { name: 'Food', amount: '500.00', period: 'monthly', start_date: '2026-11-01' };

async function rejection(p: Promise<unknown>): Promise<PublicApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PublicApiError) return e;
    throw e;
  }
  throw new Error('expected a PublicApiError');
}

function makePrisma(over: Record<string, any> = {}) {
  return {
    budget: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => ({ id: 'b-1' })) },
    category: { findFirst: jest.fn(async () => ({ id: CAT })) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN' })) },
    ...over,
  };
}
function makeAdapter(prisma: any) {
  const budgets = {
    createWithStatus: jest.fn(async () => ({ budget: { id: 'b-new' }, isNew: true })),
    update: jest.fn(async () => ({ id: 'b-1' })),
    remove: jest.fn(async () => ({ success: true })),
  };
  return { adapter: new PublicBudgetWriteAdapter(prisma, budgets as any), budgets };
}

describe('internal DTO mapping', () => {
  it('create: localId = key, allocations become categories', () => {
    expect(
      toInternalBudgetCreateDto(
        {
          ...BODY,
          end_date: '2026-11-30',
          alert_threshold: 90,
          allocations: [{ category_id: CAT, amount: '100.50' }],
        },
        { idempotencyKey: KEY, baseCurrency: 'PLN' }
      )
    ).toEqual({
      localId: KEY,
      name: 'Food',
      amount: 500,
      currencyCode: 'PLN',
      period: 'monthly',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      alertThreshold: 90,
      categories: [{ categoryId: CAT, amount: 100.5 }],
    });
  });

  it('update: only present fields; allocations [] is an explicit empty set, absent is not carried', () => {
    expect(toInternalBudgetUpdateDto({ amount: '5.00' })).toEqual({ amount: 5 });
    expect(toInternalBudgetUpdateDto({ allocations: [] })).toEqual({ categories: [] });
    expect('categories' in toInternalBudgetUpdateDto({ name: 'x' })).toBe(false);
  });
});

describe('PublicBudgetWriteAdapter.create', () => {
  it('creates through BudgetsService with the attribution', async () => {
    const { adapter, budgets } = makeAdapter(makePrisma());
    expect(await adapter.create(CTX, KEY, BODY)).toEqual({ id: 'b-new', isNew: true });
    expect(budgets.createWithStatus).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      expect.objectContaining({ localId: KEY, currencyCode: 'PLN', amount: 500 }),
      { createdByOAuthClientId: 'client-db-1' }
    );
  });

  it('a racing repeat reported as not new answers isNew false', async () => {
    const { adapter, budgets } = makeAdapter(makePrisma());
    budgets.createWithStatus.mockResolvedValueOnce({ budget: { id: 'b-new' }, isNew: false });
    expect((await adapter.create(CTX, KEY, BODY)).isNew).toBe(false);
  });

  it('a repeat from the same app returns the first budget with no service call', async () => {
    const prisma = makePrisma();
    prisma.budget.findMany.mockResolvedValueOnce([
      { id: 'b-new', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false },
    ] as any);
    const { adapter, budgets } = makeAdapter(prisma);
    expect(await adapter.create(CTX, KEY, BODY)).toEqual({ id: 'b-new', isNew: false });
    expect(budgets.createWithStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['another app', { id: 'x', clientId: KEY, createdByOAuthClientId: 'other', isDeleted: false }],
    ['the app', { id: 'x', clientId: KEY, createdByOAuthClientId: null, isDeleted: false }],
    [
      'a deleted budget',
      { id: 'x', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: true },
    ],
    [
      'another budget server id',
      { id: KEY, clientId: 'o', createdByOAuthClientId: null, isDeleted: false },
    ],
  ])('409 idempotency_key_conflict for a key owned by %s', async (_n, found) => {
    const prisma = makePrisma();
    prisma.budget.findMany.mockResolvedValueOnce([found] as any);
    const { adapter, budgets } = makeAdapter(prisma);
    const err = await rejection(adapter.create(CTX, KEY, BODY));
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_conflict');
    expect(budgets.createWithStatus).not.toHaveBeenCalled();
  });

  it('an allocation with a non-expense category is 422 naming allocations[i].category_id', async () => {
    const prisma = makePrisma({
      category: {
        findFirst: jest.fn(async ({ where }: any) => (where.id === CAT ? { id: CAT } : null)),
      },
    });
    const { adapter, budgets } = makeAdapter(prisma);
    const err = await rejection(
      adapter.create(CTX, KEY, {
        ...BODY,
        allocations: [
          { category_id: CAT, amount: '1.00' },
          { category_id: CAT2, amount: '1.00' },
        ],
      })
    );
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('validation_failed');
    expect(err.details).toEqual({
      fields: { 'allocations[1].category_id': [expect.stringContaining('expense')] },
    });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: CAT2, accountId: 'acc-1', type: 'expense', isDeleted: false },
      select: { id: true },
    });
    expect(budgets.createWithStatus).not.toHaveBeenCalled();
  });

  it('a repeated category_id is 422 duplicate on each repeat, before any write (create and update)', async () => {
    const dup = [
      { category_id: CAT, amount: '100.00' },
      { category_id: CAT2, amount: '1.00' },
      { category_id: CAT.toUpperCase(), amount: '50.00' },
      { category_id: CAT, amount: '5.00' },
    ];
    const { adapter, budgets } = makeAdapter(makePrisma());
    for (const call of [
      adapter.create(CTX, KEY, { ...BODY, allocations: dup }),
      adapter.update(CTX, 'b-1', { allocations: dup }),
    ]) {
      const err = await rejection(call);
      expect(err.getStatus()).toBe(422);
      expect(err.code).toBe('validation_failed');
      expect(err.details).toEqual({
        fields: {
          'allocations[2].category_id': ['duplicate category_id'],
          'allocations[3].category_id': ['duplicate category_id'],
        },
      });
    }
    expect(budgets.createWithStatus).not.toHaveBeenCalled();
    expect(budgets.update).not.toHaveBeenCalled();
  });

  it('does not validate allocation totals against the budget amount', async () => {
    const { adapter, budgets } = makeAdapter(makePrisma());
    await adapter.create(CTX, KEY, {
      ...BODY,
      amount: '10.00',
      allocations: [{ category_id: CAT, amount: '999.00' }],
    });
    expect(budgets.createWithStatus).toHaveBeenCalled();
  });
});

describe('PublicBudgetWriteAdapter.update / remove', () => {
  it('update resolves the server id, checks new allocations, passes the set through', async () => {
    const { adapter, budgets } = makeAdapter(makePrisma());
    expect(
      await adapter.update(CTX, 'b-1', { allocations: [{ category_id: CAT, amount: '2.00' }] })
    ).toEqual({ id: 'b-1' });
    expect(budgets.update).toHaveBeenCalledWith('acc-1', 'b-1', {
      categories: [{ categoryId: CAT, amount: 2 }],
    });
  });

  it('allocations [] clears without any category lookup; absent keeps them', async () => {
    const prisma = makePrisma();
    const { adapter, budgets } = makeAdapter(prisma);
    await adapter.update(CTX, 'b-1', { allocations: [] });
    expect(budgets.update).toHaveBeenLastCalledWith('acc-1', 'b-1', { categories: [] });
    await adapter.update(CTX, 'b-1', { name: 'x' });
    expect(budgets.update).toHaveBeenLastCalledWith('acc-1', 'b-1', { name: 'x' });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
  });

  it('update and remove of a deleted or unknown budget are 404', async () => {
    const prisma = makePrisma({
      budget: { findFirst: jest.fn(async () => null), findMany: jest.fn() },
    });
    const { adapter, budgets } = makeAdapter(prisma);
    for (const call of [adapter.update(CTX, 'b-1', { name: 'x' }), adapter.remove(CTX, 'b-1')]) {
      expect((await rejection(call)).getStatus()).toBe(404);
    }
    expect(budgets.update).not.toHaveBeenCalled();
    expect(budgets.remove).not.toHaveBeenCalled();
  });

  it('remove soft-deletes through the service by server id', async () => {
    const { adapter, budgets } = makeAdapter(makePrisma());
    await adapter.remove(CTX, 'b-1');
    expect(budgets.remove).toHaveBeenCalledWith('acc-1', 'b-1');
  });
});
