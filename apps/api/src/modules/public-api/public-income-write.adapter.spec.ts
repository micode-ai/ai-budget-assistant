import { PublicApiError } from './public-api-error';
import {
  PublicIncomeWriteAdapter,
  toInternalIncomeCreateDto,
  toInternalIncomeUpdateDto,
} from './public-income-write.adapter';
import type { PublicWriteContext } from './public-expense-write.adapter';

const KEY = '7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6';
const CTX: PublicWriteContext = { accountId: 'acc-1', userId: 'user-1', clientDbId: 'client-db-1' };
const CAT = '11111111-1111-4111-8111-111111111111';

async function rejection(p: Promise<unknown>): Promise<PublicApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PublicApiError) return e;
    throw e;
  }
  throw new Error('expected a PublicApiError');
}

function row(over: Record<string, unknown> = {}) {
  return { id: 'inc-1', linkedTransfer: null, ...over };
}

function makePrisma(over: Record<string, any> = {}) {
  return {
    income: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => row()) },
    category: { findFirst: jest.fn(async () => ({ id: CAT })) },
    tag: { findMany: jest.fn(async () => []) },
    project: { findFirst: jest.fn(async () => null) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN' })) },
    ...over,
  };
}

function makeAdapter(prisma: any) {
  const incomes = {
    createWithStatus: jest.fn(async () => ({ income: { id: 'inc-new' }, isNew: true })),
    update: jest.fn(async () => ({ id: 'inc-1' })),
    remove: jest.fn(async () => ({ success: true })),
  };
  return { adapter: new PublicIncomeWriteAdapter(prisma, incomes as any), incomes };
}

describe('toInternalIncomeCreateDto / toInternalIncomeUpdateDto', () => {
  it('maps the body; localId = key, source api, no debt fields', () => {
    const dto = toInternalIncomeCreateDto(
      {
        amount: '4200.00',
        date: '2026-10-31',
        category_id: CAT,
        description: 'Salary',
        notes: 'n',
      },
      { idempotencyKey: KEY, baseCurrency: 'PLN' }
    );
    expect(dto).toEqual({
      localId: KEY,
      amount: 4200,
      currencyCode: 'PLN',
      date: '2026-10-31',
      categoryId: CAT,
      description: 'Salary',
      notes: 'n',
      tagIds: undefined,
      projectId: undefined,
      source: 'api',
    });
  });

  it('update carries only present fields, null clears', () => {
    expect(toInternalIncomeUpdateDto({ amount: '5.00' })).toEqual({ amount: 5 });
    expect(
      toInternalIncomeUpdateDto({
        category_id: null,
        description: null,
        notes: null,
        project_id: null,
        tag_ids: [],
      })
    ).toEqual({
      categoryId: null,
      description: null,
      notes: null,
      projectId: null,
      tagIds: [],
    });
  });
});

describe('PublicIncomeWriteAdapter.create', () => {
  it('creates through IncomesService with the attribution and nothing else', async () => {
    const { adapter, incomes } = makeAdapter(makePrisma());
    const out = await adapter.create(CTX, KEY, { amount: '12.50', date: '2026-10-31' });
    expect(out).toEqual({ id: 'inc-new', isNew: true });
    expect(incomes.createWithStatus).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      expect.objectContaining({ localId: KEY, amount: 12.5, currencyCode: 'PLN', source: 'api' }),
      { createdByOAuthClientId: 'client-db-1' }
    );
  });

  it('a racing repeat the service reports as not new answers isNew false', async () => {
    const { adapter, incomes } = makeAdapter(makePrisma());
    incomes.createWithStatus.mockResolvedValueOnce({ income: { id: 'inc-new' }, isNew: false });
    expect(await adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' })).toEqual({ id: 'inc-new', isNew: false });
  });

  it('a repeat from the same app returns the first income, isNew false, no service call', async () => {
    const prisma = makePrisma();
    prisma.income.findMany.mockResolvedValueOnce([
      { id: 'inc-new', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false },
    ] as any);
    const { adapter, incomes } = makeAdapter(prisma);
    expect(await adapter.create(CTX, KEY, { amount: '99.00', date: '2026-10-31' })).toEqual({
      id: 'inc-new',
      isNew: false,
    });
    expect(incomes.createWithStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['another app', { id: 'x', clientId: KEY, createdByOAuthClientId: 'other', isDeleted: false }],
    [
      'an app-created income',
      { id: 'x', clientId: KEY, createdByOAuthClientId: null, isDeleted: false },
    ],
    [
      'a deleted income',
      { id: 'x', clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: true },
    ],
    [
      'another income server id',
      { id: KEY, clientId: 'other-client', createdByOAuthClientId: null, isDeleted: false },
    ],
  ])('409 idempotency_key_conflict for a key owned by %s', async (_n, found) => {
    const prisma = makePrisma();
    prisma.income.findMany.mockResolvedValueOnce([found] as any);
    const { adapter, incomes } = makeAdapter(prisma);
    const err = await rejection(adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31' }));
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_conflict');
    expect(incomes.createWithStatus).not.toHaveBeenCalled();
  });

  it('an expense category id is 422 with details.fields.category_id (income type checked)', async () => {
    const prisma = makePrisma({ category: { findFirst: jest.fn(async () => null) } });
    const { adapter, incomes } = makeAdapter(prisma);
    const err = await rejection(
      adapter.create(CTX, KEY, { amount: '1.00', date: '2026-10-31', category_id: CAT })
    );
    expect(err.getStatus()).toBe(422);
    expect(err.details).toEqual({ fields: { category_id: [expect.stringContaining('income')] } });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: CAT, accountId: 'acc-1', type: 'income', isDeleted: false },
      select: { id: true },
    });
    expect(incomes.createWithStatus).not.toHaveBeenCalled();
  });
});

describe('PublicIncomeWriteAdapter.update / remove', () => {
  it('a debt repayment income takes an amount edit: service update gets amount 5', async () => {
    const prisma = makePrisma();
    prisma.income.findFirst.mockResolvedValue(row({ isDebtRepayment: true }) as any);
    const { adapter, incomes } = makeAdapter(prisma);
    expect(await adapter.update(CTX, 'inc-1', { amount: '5.00' })).toEqual({ id: 'inc-1' });
    expect(incomes.update).toHaveBeenCalledWith('acc-1', 'inc-1', { amount: 5 });
  });

  it('a group-linked income passes amount/currency/date through: IncomesService.update does not ignore them', async () => {
    const prisma = makePrisma();
    prisma.income.findFirst.mockResolvedValue(row({ groupCashLink: { id: 'l-1' } }) as any);
    const { adapter, incomes } = makeAdapter(prisma);
    await adapter.update(CTX, 'inc-1', { amount: '9.00', currency: 'EUR', date: '2026-01-02' });
    expect(incomes.update).toHaveBeenCalledWith('acc-1', 'inc-1', {
      amount: 9,
      currencyCode: 'EUR',
      date: '2026-01-02',
    });
  });

  it('a transfer-linked income refuses PATCH and DELETE with 422 naming the transfer', async () => {
    const prisma = makePrisma();
    prisma.income.findFirst.mockResolvedValue(row({ linkedTransfer: { id: 't-1' } }) as any);
    const { adapter, incomes } = makeAdapter(prisma);
    for (const call of [
      adapter.update(CTX, 'inc-1', { notes: 'x' }),
      adapter.remove(CTX, 'inc-1'),
    ]) {
      const err = await rejection(call);
      expect(err.getStatus()).toBe(422);
      expect(err.code).toBe('validation_failed');
      expect(err.message).toMatch(/transfer/i);
    }
    expect(incomes.update).not.toHaveBeenCalled();
    expect(incomes.remove).not.toHaveBeenCalled();
  });

  it('remove soft-deletes through the service by server id', async () => {
    const { adapter, incomes } = makeAdapter(makePrisma());
    await adapter.remove(CTX, 'inc-1');
    expect(incomes.remove).toHaveBeenCalledWith('acc-1', 'inc-1');
  });

  it('404 for an income not in the account', async () => {
    const prisma = makePrisma();
    prisma.income.findFirst.mockResolvedValue(null as any);
    const { adapter } = makeAdapter(prisma);
    expect((await rejection(adapter.remove(CTX, 'nope'))).getStatus()).toBe(404);
  });
});
