import { PublicApiError } from './public-api-error';
import {
  assertReferencesBelongToAccount,
  parseIdempotencyKey,
  PublicExpenseWriteAdapter,
  toInternalCreateDto,
  toInternalUpdateDto,
  type PublicWriteContext,
} from './public-expense-write.adapter';

const KEY = '7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6';
const CTX: PublicWriteContext = { accountId: 'acc-1', userId: 'user-1', clientDbId: 'client-db-1' };
const CAT = '11111111-1111-4111-8111-111111111111';
const TAG = '22222222-2222-4222-8222-222222222222';
const PROJ = '33333333-3333-4333-8333-333333333333';

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
    expense: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    category: { findFirst: jest.fn(async () => ({ id: CAT })) },
    tag: { findMany: jest.fn(async (args: any) => args.where.id.in.map((id: string) => ({ id }))) },
    project: { findFirst: jest.fn(async () => ({ id: PROJ })) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN' })) },
    ...over,
  };
}

function makeAdapter(prisma: any) {
  const expenses = {
    create: jest.fn(async () => ({ expense: { id: 'exp-new', currencyCode: 'PLN' }, isNew: true })),
    update: jest.fn(async () => ({ id: 'exp-1', currencyCode: 'EUR' })),
    remove: jest.fn(async () => ({ success: true })),
  };
  const budgetAlerts = { checkBudgetsForAccount: jest.fn(async () => undefined) };
  const sharedActivity = { notifyExpenseCreated: jest.fn(async () => undefined) };
  const adapter = new PublicExpenseWriteAdapter(prisma, expenses as any, budgetAlerts as any, sharedActivity as any);
  return { adapter, expenses, budgetAlerts, sharedActivity };
}

describe('parseIdempotencyKey', () => {
  it('accepts a UUID and lower-cases it (it becomes the row clientId)', () => {
    expect(parseIdempotencyKey(KEY.toUpperCase())).toBe(KEY);
  });

  it.each([undefined, '', 'abc', `${KEY}x`])('refuses %p with 400 validation_failed', (raw) => {
    const err = (() => {
      try {
        parseIdempotencyKey(raw);
      } catch (e) {
        return e as PublicApiError;
      }
      throw new Error('expected a throw');
    })();
    expect(err.getStatus()).toBe(400);
    expect(err.code).toBe('validation_failed');
    expect(err.details).toEqual({ fields: { 'Idempotency-Key': expect.any(Array) } });
  });
});

describe('toInternalCreateDto', () => {
  it('maps the amount string to the number the internal DTO expects, source api, localId = key', () => {
    const dto = toInternalCreateDto(
      { amount: '12.50', date: '2026-10-31', merchant: 'Biedronka', tag_ids: [TAG], project_id: PROJ, category_id: CAT },
      { idempotencyKey: KEY, baseCurrency: 'PLN' },
    );
    expect(dto).toMatchObject({
      localId: KEY,
      amount: 12.5,
      currencyCode: 'PLN',
      date: '2026-10-31',
      merchant: 'Biedronka',
      tagIds: [TAG],
      projectId: PROJ,
      categoryId: CAT,
      source: 'api',
    });
    // Attribution is never a dto field (the service takes it as a separate argument).
    expect('createdByOAuthClientId' in dto).toBe(false);
  });

  it('uses the given currency over the account base, and maps items with defaults', () => {
    const dto = toInternalCreateDto(
      {
        amount: '3.00',
        currency: 'EUR',
        date: '2026-10-31',
        location: { lat: 52.2, lng: 21.0 },
        items: [
          { description: 'Milk', quantity: '2', unit_price: '1.25', total_price: '2.50' },
          { description: 'Bag', total_price: '0.50' },
        ],
      },
      { idempotencyKey: KEY, baseCurrency: 'PLN' },
    );
    expect(dto.currencyCode).toBe('EUR');
    expect(dto.location).toEqual({ lat: 52.2, lng: 21.0, name: undefined });
    expect(dto.items).toEqual([
      { description: 'Milk', quantity: 2, unitPrice: 1.25, totalPrice: 2.5, sortOrder: 0 },
      { description: 'Bag', quantity: 1, unitPrice: 0, totalPrice: 0.5, sortOrder: 1 },
    ]);
  });
});

describe('toInternalUpdateDto', () => {
  it('carries only the fields present, and null for a clear', () => {
    expect(toInternalUpdateDto({ amount: '7.10' })).toEqual({ amount: 7.1 });
    expect(
      toInternalUpdateDto({ category_id: null, description: null, location: null, project_id: null, tag_ids: [], time: null }),
    ).toEqual({ categoryId: null, description: null, location: null, projectId: null, tagIds: [], time: null });
  });

  it('never sets source or the creator', () => {
    const dto = toInternalUpdateDto({ amount: '1.00', currency: 'USD', date: '2026-01-02', merchant: 'X', notes: 'n' });
    expect(dto).toEqual({ amount: 1, currencyCode: 'USD', date: '2026-01-02', merchant: 'X', notes: 'n' });
  });
});

describe('assertReferencesBelongToAccount', () => {
  it('refuses a category of another account with 422 details.fields.category_id', async () => {
    const prisma = makePrisma({ category: { findFirst: jest.fn(async () => null) } });
    const err = await rejection(assertReferencesBelongToAccount(prisma as any, 'acc-1', { category_id: CAT }));
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('validation_failed');
    expect(err.details).toEqual({ fields: { category_id: [expect.any(String)] } });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: CAT, accountId: 'acc-1', type: 'expense', isDeleted: false },
      select: { id: true },
    });
  });

  it('reports every missing tag and a foreign project together', async () => {
    const other = '44444444-4444-4444-8444-444444444444';
    const prisma = makePrisma({
      tag: { findMany: jest.fn(async () => [{ id: TAG }]) },
      project: { findFirst: jest.fn(async () => null) },
    });
    const err = await rejection(
      assertReferencesBelongToAccount(prisma as any, 'acc-1', { tag_ids: [TAG, other], project_id: PROJ }),
    );
    expect(Object.keys(err.details!.fields as object).sort()).toEqual(['project_id', 'tag_ids']);
    expect((err.details!.fields as any).tag_ids).toEqual([expect.stringContaining(other)]);
    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: { id: { in: [TAG, other] }, accountId: 'acc-1', isDeleted: false },
      select: { id: true },
    });
  });

  it('a null (clear) references nothing and is not looked up', async () => {
    const prisma = makePrisma();
    await assertReferencesBelongToAccount(prisma as any, 'acc-1', { category_id: null, project_id: null });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });
});

describe('PublicExpenseWriteAdapter.create', () => {
  it('creates through ExpensesService with the attribution, then fires the app controller side effects', async () => {
    const prisma = makePrisma();
    const { adapter, expenses, budgetAlerts, sharedActivity } = makeAdapter(prisma);

    const out = await adapter.create(CTX, KEY, { amount: '12.50', date: '2026-10-31', description: 'Lunch' });

    expect(out).toEqual({ id: 'exp-new', isNew: true });
    expect(expenses.create).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      expect.objectContaining({ localId: KEY, amount: 12.5, currencyCode: 'PLN', source: 'api' }),
      { createdByOAuthClientId: 'client-db-1' },
    );
    expect(budgetAlerts.checkBudgetsForAccount).toHaveBeenCalledWith('acc-1', 'PLN');
    expect(sharedActivity.notifyExpenseCreated).toHaveBeenCalledWith('acc-1', 'user-1', 'exp-new', 12.5, 'PLN', 'Lunch');
  });

  it('same key twice with a different amount returns the first expense, isNew false, no write', async () => {
    const prisma = makePrisma();
    const { adapter, expenses } = makeAdapter(prisma);
    await adapter.create(CTX, KEY, { amount: '12.50', date: '2026-10-31' });

    // The first call's row is now there, created by this app.
    prisma.expense.findMany.mockResolvedValueOnce([
      { id: 'exp-new', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false, isPlanned: false },
    ] as any);
    const second = await adapter.create(CTX, KEY, { amount: '99.99', date: '2026-10-31' });

    expect(second).toEqual({ id: 'exp-new', isNew: false });
    expect(expenses.create).toHaveBeenCalledTimes(1);
    expect(expenses.update).not.toHaveBeenCalled();
  });

  it('a key matching an expense the app (not this client) created is 409 idempotency_key_conflict', async () => {
    const prisma = makePrisma();
    prisma.expense.findMany.mockResolvedValueOnce([
      { id: 'exp-app', clientId: KEY, createdByOAuthClientId: null, isDeleted: false, isPlanned: false },
    ] as any);
    const { adapter, expenses } = makeAdapter(prisma);

    const err = await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' }));
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_conflict');
    expect(JSON.stringify(err.toBody())).not.toContain('exp-app');
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('a key of another OAuth app is 409 too', async () => {
    const prisma = makePrisma();
    prisma.expense.findMany.mockResolvedValueOnce([
      { id: 'exp-x', clientId: KEY, createdByOAuthClientId: 'client-db-2', isDeleted: false, isPlanned: false },
    ] as any);
    const { adapter } = makeAdapter(prisma);
    expect((await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' }))).code).toBe(
      'idempotency_key_conflict',
    );
  });

  it('a replay of a key whose expense was deleted is 409, never a resurrection', async () => {
    const prisma = makePrisma();
    prisma.expense.findMany.mockResolvedValueOnce([
      { id: 'exp-gone', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: true, isPlanned: false },
    ] as any);
    const { adapter, expenses } = makeAdapter(prisma);
    expect((await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' }))).code).toBe(
      'idempotency_key_conflict',
    );
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('a key equal to another expense server id is 409 (ids resolve as id OR clientId)', async () => {
    const prisma = makePrisma();
    prisma.expense.findMany.mockResolvedValueOnce([
      { id: KEY, clientId: 'some-other-client-id', createdByOAuthClientId: null, isDeleted: false, isPlanned: false },
    ] as any);
    const { adapter } = makeAdapter(prisma);
    expect((await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' }))).code).toBe(
      'idempotency_key_conflict',
    );
  });

  it('a foreign category is refused before any write', async () => {
    const prisma = makePrisma({ category: { findFirst: jest.fn(async () => null) } });
    const { adapter, expenses } = makeAdapter(prisma);
    const err = await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31', category_id: CAT }));
    expect(err.getStatus()).toBe(422);
    expect(err.details).toEqual({ fields: { category_id: [expect.any(String)] } });
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('a create that lost the race to an identical request (isNew false) fires no new-expense side effects', async () => {
    const prisma = makePrisma();
    const { adapter, expenses, budgetAlerts, sharedActivity } = makeAdapter(prisma);
    expenses.create.mockResolvedValueOnce({ expense: { id: 'exp-new', currencyCode: 'PLN' }, isNew: false });
    expect(await adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' })).toEqual({ id: 'exp-new', isNew: false });
    expect(budgetAlerts.checkBudgetsForAccount).not.toHaveBeenCalled();
    expect(sharedActivity.notifyExpenseCreated).not.toHaveBeenCalled();
  });
});

describe('PublicExpenseWriteAdapter.update / remove', () => {
  const live = { id: 'exp-1' };

  it('resolves the server id first and passes it to the service', async () => {
    const prisma = makePrisma();
    prisma.expense.findFirst.mockResolvedValue(live as any);
    const { adapter, expenses, budgetAlerts } = makeAdapter(prisma);

    expect(await adapter.update(CTX, 'exp-1', { amount: '5.00' })).toEqual({ id: 'exp-1' });
    expect(prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exp-1', accountId: 'acc-1', isDeleted: false, isPlanned: false } }),
    );
    expect(expenses.update).toHaveBeenCalledWith('acc-1', 'exp-1', { amount: 5 });
    expect(budgetAlerts.checkBudgetsForAccount).toHaveBeenCalledWith('acc-1', 'EUR');
  });

  it('a text-only edit does not re-check budgets', async () => {
    const prisma = makePrisma();
    prisma.expense.findFirst.mockResolvedValue(live as any);
    const { adapter, budgetAlerts } = makeAdapter(prisma);
    await adapter.update(CTX, 'exp-1', { notes: 'x' });
    expect(budgetAlerts.checkBudgetsForAccount).not.toHaveBeenCalled();
  });

  it('an unknown / other-account id is 404 and nothing is written', async () => {
    const prisma = makePrisma();
    const { adapter, expenses } = makeAdapter(prisma);
    expect((await rejection(adapter.update(CTX, 'nope', { amount: '5.00' }))).getStatus()).toBe(404);
    expect((await rejection(adapter.remove(CTX, 'nope'))).getStatus()).toBe(404);
    expect(expenses.update).not.toHaveBeenCalled();
    expect(expenses.remove).not.toHaveBeenCalled();
  });

  describe('a shared-group share row (source: group)', () => {
    const mirror = { id: 'exp-1', source: 'group' };

    it('refuses amount, currency and date with 422 "set by the shared group", writing nothing', async () => {
      const prisma = makePrisma();
      prisma.expense.findFirst.mockResolvedValue(mirror as any);
      const { adapter, expenses } = makeAdapter(prisma);
      const err = await rejection(
        adapter.update(CTX, 'exp-1', { amount: '5.00', currency: 'EUR', date: '2026-10-01', notes: 'ok' }),
      );
      expect(err.getStatus()).toBe(422);
      expect(err.code).toBe('validation_failed');
      expect(err.details).toEqual({
        fields: {
          amount: ['set by the shared group'],
          currency: ['set by the shared group'],
          date: ['set by the shared group'],
        },
      });
      expect(expenses.update).not.toHaveBeenCalled();
    });

    it('still accepts the fields the user owns (category, notes, ...)', async () => {
      const prisma = makePrisma();
      prisma.expense.findFirst.mockResolvedValue(mirror as any);
      const { adapter, expenses } = makeAdapter(prisma);
      await adapter.update(CTX, 'exp-1', { category_id: CAT, notes: 'mine' });
      expect(expenses.update).toHaveBeenCalledWith('acc-1', 'exp-1', { categoryId: CAT, notes: 'mine' });
    });

    // The app allows it and the mirror never recreates a row the user deleted (shared-groups.md).
    it('can be deleted, as in the app', async () => {
      const prisma = makePrisma();
      prisma.expense.findFirst.mockResolvedValue(mirror as any);
      const { adapter, expenses } = makeAdapter(prisma);
      await adapter.remove(CTX, 'exp-1');
      expect(expenses.remove).toHaveBeenCalledWith('acc-1', 'exp-1');
    });
  });

  it('delete soft-deletes through ExpensesService.remove with the server id', async () => {
    const prisma = makePrisma();
    prisma.expense.findFirst.mockResolvedValue(live as any);
    const { adapter, expenses } = makeAdapter(prisma);
    await adapter.remove(CTX, 'exp-1');
    expect(expenses.remove).toHaveBeenCalledWith('acc-1', 'exp-1');
  });
});

describe('PublicExpenseWriteAdapter.create per account', () => {
  it('the same Idempotency-Key in two accounts of one connection creates two expenses; a replay stays in its account', async () => {
    const stored: { id: string; accountId: string; clientId: string }[] = [];
    const prisma = makePrisma();
    (prisma.expense.findMany as jest.Mock).mockImplementation(async (args: any) =>
      stored
        .filter((r) => r.accountId === args.where.accountId && (r.clientId === KEY || r.id === KEY))
        .map((r) => ({ ...r, createdByOAuthClientId: 'client-db-1', isDeleted: false, isPlanned: false })),
    );
    const { adapter, expenses } = makeAdapter(prisma);
    let n = 0;
    expenses.create.mockImplementation((async (accountId: string, _u: string, dto: any) => {
      const id = `exp-${++n}`;
      stored.push({ id, accountId, clientId: dto.localId });
      return { expense: { id, currencyCode: 'PLN' }, isNew: true };
    }) as any);

    const inA = await adapter.create({ ...CTX, accountId: 'acc-A' }, KEY, { amount: '1.00', date: '2026-10-31' });
    const inB = await adapter.create({ ...CTX, accountId: 'acc-B' }, KEY, { amount: '2.00', date: '2026-10-31' });
    expect(inA).toEqual({ id: 'exp-1', isNew: true });
    expect(inB).toEqual({ id: 'exp-2', isNew: true });

    const replay = await adapter.create({ ...CTX, accountId: 'acc-A' }, KEY, { amount: '9.00', date: '2026-10-31' });
    expect(replay).toEqual({ id: 'exp-1', isNew: false });
    expect(expenses.create).toHaveBeenCalledTimes(2);
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'acc-B' }) }),
    );
  });
});
