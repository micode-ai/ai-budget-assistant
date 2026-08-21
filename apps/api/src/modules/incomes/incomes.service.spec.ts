import { IncomesService } from './incomes.service';
import { NotFoundException } from '@nestjs/common';

function makeService(overrides: {
  categoryFindUnique?: any;
  categoryFindFirst?: any;
  categoryCreate?: any;
  txOverrides?: Record<string, any>;
} = {}) {
  const category = {
    findUnique: jest.fn().mockResolvedValue(overrides.categoryFindUnique ?? null),
    findFirst: jest.fn().mockResolvedValue(overrides.categoryFindFirst ?? null),
    create: jest.fn().mockResolvedValue(overrides.categoryCreate ?? { id: 'new-cat', name: 'Freelance', type: 'income' }),
  };

  const income = {
    upsert: jest.fn().mockResolvedValue({ id: 'inc-1' }),
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 'inc-1', amount: 100, currencyCode: 'USD', user: { name: 'Alice' } }),
    update: jest.fn().mockResolvedValue({}),
  };
  const tag = { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({}) };
  const incomeTag = { createMany: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) };
  const project = { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) };
  const projectIncome = { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) };

  const txBase = { category, income, tag, incomeTag, project, projectIncome, ...overrides.txOverrides };

  const prisma: any = {
    category,
    income: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'inc-1',
        isDeleted: false,
        user: { name: 'Alice' },
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (cb: any) => cb(txBase)),
  };

  const cache: any = { del: jest.fn().mockResolvedValue(undefined) };
  const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const familyFeed: any = { recordEvent: jest.fn().mockResolvedValue(undefined) };

  const service = new IncomesService(prisma, cache, gamificationService, familyFeed);
  return { service, prisma, cache, gamificationService, familyFeed, tx: txBase };
}

describe('IncomesService.create', () => {
  it('upserts on accountId+clientId and returns createdByUserName flattened from user', async () => {
    const { service, tx } = makeService();

    const dto: any = {
      localId: 'local-1',
      amount: 100,
      currencyCode: 'USD',
      date: '2026-07-01',
    };
    const result = await service.create('acc-1', 'user-1', dto);

    expect(tx.income.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId_clientId: { accountId: 'acc-1', clientId: 'local-1' } } }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'inc-1', amount: 100, currencyCode: 'USD', createdByUserName: 'Alice' }),
    );
  });

  it('resolves a UUID categoryId only if it exists, else nulls it out', async () => {
    const { service, tx } = makeService({ categoryFindUnique: null });

    await service.create('acc-1', 'user-1', {
      localId: 'local-2',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      categoryId: '11111111-1111-4111-8111-111111111111',
    });

    expect(tx.category.findUnique).toHaveBeenCalledWith({ where: { id: '11111111-1111-4111-8111-111111111111' } });
    const createArgs = tx.income.upsert.mock.calls[0][0].create;
    expect(createArgs.categoryId).toBeNull();
  });

  it('resolves a category by case-insensitive name match', async () => {
    const { service, tx } = makeService({ categoryFindFirst: { id: 'cat-salary' } });

    await service.create('acc-1', 'user-1', {
      localId: 'local-3',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      categoryId: 'Salary',
    });

    expect(tx.category.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'Salary', mode: 'insensitive' } },
    });
    const createArgs = tx.income.upsert.mock.calls[0][0].create;
    expect(createArgs.categoryId).toBe('cat-salary');
  });

  it('matches mobile default ids like "default-inc-salary" against account categories', async () => {
    const { service, tx } = makeService({ categoryFindFirst: null });
    // First findFirst call is the exact-name lookup (misses); second is the default-id word match.
    tx.category.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cat-matched' });

    await service.create('acc-1', 'user-1', {
      localId: 'local-4',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      categoryId: 'default-inc-salary',
    });

    const secondCall = tx.category.findFirst.mock.calls[1][0];
    expect(secondCall.where.accountId).toBe('acc-1');
    expect(secondCall.where.AND).toEqual([{ name: { contains: 'salary', mode: 'insensitive' } }]);
    const createArgs = tx.income.upsert.mock.calls[0][0].create;
    expect(createArgs.categoryId).toBe('cat-matched');
  });

  it('auto-creates an income category for a free-text name with no match', async () => {
    const { service, tx } = makeService({ categoryFindFirst: null, categoryCreate: { id: 'new-cat' } });

    await service.create('acc-1', 'user-1', {
      localId: 'local-5',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      categoryId: 'Freelance Work',
    });

    expect(tx.category.create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', name: 'Freelance Work', type: 'income' },
    });
    const createArgs = tx.income.upsert.mock.calls[0][0].create;
    expect(createArgs.categoryId).toBe('new-cat');
  });

  it('never auto-creates for an unmatched "default-" id — leaves categoryId null', async () => {
    const { service, tx } = makeService({ categoryFindFirst: null });

    await service.create('acc-1', 'user-1', {
      localId: 'local-6',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      categoryId: 'default-inc-unknown-xyz-word',
    });

    expect(tx.category.create).not.toHaveBeenCalled();
    const createArgs = tx.income.upsert.mock.calls[0][0].create;
    expect(createArgs.categoryId).toBeNull();
  });

  it('links valid tags and increments usage count', async () => {
    const { service, tx } = makeService();
    tx.tag.findMany.mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);

    await service.create('acc-1', 'user-1', {
      localId: 'local-7',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
      tagIds: ['tag-1', 'tag-2', 'tag-unknown'],
    });

    expect(tx.incomeTag.createMany).toHaveBeenCalledWith({
      data: [
        { incomeId: 'inc-1', tagId: 'tag-1' },
        { incomeId: 'inc-1', tagId: 'tag-2' },
      ],
      skipDuplicates: true,
    });
    expect(tx.tag.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag-1', 'tag-2'] } },
      data: { usageCount: { increment: 1 } },
    });
  });

  it('fires gamification check and cache invalidation without blocking the response', async () => {
    const { service, gamificationService, cache } = makeService();

    await service.create('acc-1', 'user-1', {
      localId: 'local-8',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-07-01',
    });

    expect(gamificationService.checkAchievements).toHaveBeenCalledWith('acc-1', 'user-1');
    expect(cache.del).toHaveBeenCalledWith('uc:acc-1');
  });

  it('records a family-feed INCOME_ADDED event fire-and-forget', async () => {
    const { service, familyFeed } = makeService();

    await service.create('acc-1', 'user-1', {
      localId: 'local-9',
      amount: 100,
      currencyCode: 'USD',
      date: '2026-07-01',
    });

    expect(familyFeed.recordEvent).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      'INCOME_ADDED',
      'inc-1',
      { amount: 100, currency: 'USD' },
    );
  });

  it('tolerates a missing familyFeed dependency (optional injection)', async () => {
    const { prisma, cache, gamificationService } = makeService();
    const service = new IncomesService(prisma, cache, gamificationService, undefined);

    await expect(
      service.create('acc-1', 'user-1', {
        localId: 'local-10',
        amount: 10,
        currencyCode: 'USD',
        date: '2026-07-01',
      } as any),
    ).resolves.toBeDefined();
  });
});

describe('IncomesService.findAll', () => {
  it('builds the base where clause scoped to the account, excluding soft-deleted rows', async () => {
    const { service, prisma } = makeService();

    await service.findAll('acc-1', {} as any);

    expect(prisma.income.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', isDeleted: false } }),
    );
    expect(prisma.income.count).toHaveBeenCalledWith({ where: { accountId: 'acc-1', isDeleted: false } });
  });

  it('adds date range, category, search, and debt filters when provided', async () => {
    const { service, prisma } = makeService();

    await service.findAll('acc-1', {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      categoryId: 'cat-1',
      search: 'bonus',
      isDebt: true,
      isDebtRepayment: false,
    } as any);

    const where = prisma.income.findMany.mock.calls[0][0].where;
    expect(where.date).toEqual({ gte: new Date('2026-01-01'), lte: new Date('2026-01-31') });
    expect(where.categoryId).toBe('cat-1');
    expect(where.OR).toEqual([
      { description: { contains: 'bonus', mode: 'insensitive' } },
      { notes: { contains: 'bonus', mode: 'insensitive' } },
    ]);
    expect(where.isDebt).toBe(true);
    expect(where.isDebtRepayment).toBe(false);
  });

  it('paginates and flattens createdByUserName on each row', async () => {
    const { service, prisma } = makeService();
    prisma.income.findMany.mockResolvedValue([{ id: 'inc-1', amount: 10, user: { name: 'Alice' } }]);
    prisma.income.count.mockResolvedValue(21);

    const result = await service.findAll('acc-1', { page: 2, limit: 10 } as any);

    expect(prisma.income.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(result.data).toEqual([expect.objectContaining({ id: 'inc-1', createdByUserName: 'Alice' })]);
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });
});

describe('IncomesService.findOne', () => {
  it('resolves by server id OR clientId', async () => {
    const { service, prisma } = makeService();

    const result = await service.findOne('acc-1', 'inc-1');

    expect(prisma.income.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1', isDeleted: false, OR: [{ id: 'inc-1' }, { clientId: 'inc-1' }] },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'inc-1', createdByUserName: 'Alice' }));
  });

  it('throws NotFoundException when nothing matches', async () => {
    const { service, prisma } = makeService();
    prisma.income.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOne('acc-1', 'missing')).rejects.toThrow(NotFoundException);
  });
});

describe('IncomesService.update', () => {
  it('bumps syncVersion and re-resolves category only when categoryId is provided', async () => {
    const { service, tx } = makeService({ categoryFindFirst: { id: 'cat-x' } });

    await service.update('acc-1', 'inc-1', { categoryId: 'Gift' } as any);

    const updateData = tx.income.update.mock.calls[0][0].data;
    expect(updateData.categoryId).toBe('cat-x');
    expect(updateData.syncVersion).toEqual({ increment: 1 });
  });

  it('leaves categoryId untouched (undefined) when dto omits it', async () => {
    const { service, tx } = makeService();

    await service.update('acc-1', 'inc-1', { amount: 50 } as any);

    const updateData = tx.income.update.mock.calls[0][0].data;
    expect(updateData.categoryId).toBeUndefined();
  });

  it('invalidates the user-context cache after update', async () => {
    const { service, cache } = makeService();

    await service.update('acc-1', 'inc-1', { amount: 50 } as any);

    expect(cache.del).toHaveBeenCalledWith('uc:acc-1');
  });
});

describe('IncomesService.remove', () => {
  it('soft-deletes and bumps syncVersion', async () => {
    const { service, prisma, cache } = makeService();

    const result = await service.remove('acc-1', 'inc-1');

    expect(prisma.income.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    expect(cache.del).toHaveBeenCalledWith('uc:acc-1');
    expect(result).toEqual({ success: true });
  });

  it('throws NotFoundException when the income does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.income.findFirst.mockResolvedValueOnce(null);

    await expect(service.remove('acc-1', 'missing')).rejects.toThrow(NotFoundException);
  });
});

describe('IncomesService.getByClientId', () => {
  it('looks up by the accountId+clientId composite unique key', async () => {
    const { service, prisma } = makeService();
    prisma.income.findUnique = jest.fn().mockResolvedValue({ id: 'inc-1' });

    const result = await service.getByClientId('acc-1', 'client-9');

    expect(prisma.income.findUnique).toHaveBeenCalledWith({
      where: { accountId_clientId: { accountId: 'acc-1', clientId: 'client-9' } },
    });
    expect(result).toEqual({ id: 'inc-1' });
  });
});

// ---------------------------------------------------------------------------
// ABA-431 — a new currency has to reach the wallet
// ---------------------------------------------------------------------------

describe('IncomesService.create wallet currency registration', () => {
  it('registers the income currency so the wallet can show a card for it', async () => {
    const income = { id: 'i-1', amount: 2500, currencyCode: 'USD' };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) =>
        fn({
          income: {
            upsert: jest.fn().mockResolvedValue(income),
            findUnique: jest.fn().mockResolvedValue(income),
          },
          category: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      ),
    };
    const cache: any = { del: jest.fn().mockResolvedValue(undefined) };
    const gamification: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const ensureCurrencies = jest.fn().mockResolvedValue(undefined);
    const service = new IncomesService(
      prisma,
      cache,
      gamification,
      undefined,
      { ensureCurrencies } as never,
    );

    await service.create('acc-1', 'user-1', {
      localId: 'local-1',
      amount: 2500,
      currencyCode: 'USD',
      date: '2026-08-17',
    } as never);

    expect(ensureCurrencies).toHaveBeenCalledWith('acc-1', 'user-1', ['USD']);
  });
});
