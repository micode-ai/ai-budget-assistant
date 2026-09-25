import { IncomeBulkService } from './income-bulk.service';

// Regression for the same class of bug ExpenseBulkService's spec pins: the
// mobile client uses local `clientId`s as its income ids (offline-first), so
// bulkUpdate must resolve `ids` against BOTH the server PK `id` AND `clientId`.
describe('IncomeBulkService.bulkUpdate id resolution', () => {
  function makeService(
    findManyResult: Array<{ id: string }>,
    categoryFindResult: { findUnique?: any; findFirst?: any } = {},
  ) {
    const prisma: any = {
      income: {
        findMany: jest.fn().mockResolvedValue(findManyResult),
        updateMany: jest.fn().mockResolvedValue({ count: findManyResult.length }),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue(categoryFindResult.findUnique ?? null),
        findFirst: jest.fn().mockResolvedValue(categoryFindResult.findFirst ?? null),
        create: jest.fn(),
      },
    };
    const cacheService: any = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new IncomeBulkService(prisma, cacheService);
    return { service, prisma, cacheService };
  }

  it('resolves ids by clientId as well as server id', async () => {
    const { service, prisma } = makeService([{ id: 'server-1' }, { id: 'server-2' }]);

    const res = await service.bulkUpdate('acc-1', { ids: ['client-1', 'client-2'] });

    const where = prisma.income.findMany.mock.calls[0][0].where;
    expect(where.accountId).toBe('acc-1');
    expect(where.isDeleted).toBe(false);
    expect(where.OR).toEqual([
      { id: { in: ['client-1', 'client-2'] } },
      { clientId: { in: ['client-1', 'client-2'] } },
    ]);

    const upd = prisma.income.updateMany.mock.calls[0][0];
    expect(upd.where.id.in).toEqual(['server-1', 'server-2']);
    expect(upd.where.accountId).toBe('acc-1');

    expect(res).toEqual({ updated: 2 });
  });

  it('returns {updated:0} and performs no update when nothing matches', async () => {
    const { service, prisma } = makeService([]);

    const res = await service.bulkUpdate('acc-1', { ids: ['unknown'] });

    expect(res).toEqual({ updated: 0 });
    expect(prisma.income.updateMany).not.toHaveBeenCalled();
  });

  it('invalidates the account user-context cache after a successful write', async () => {
    const { service, cacheService } = makeService([{ id: 'server-1' }]);
    await service.bulkUpdate('acc-1', { ids: ['server-1'] });
    expect(cacheService.del).toHaveBeenCalledWith('uc:acc-1');
  });
});

describe('IncomeBulkService.bulkUpdate category resolution', () => {
  function makeService(findManyResult: Array<{ id: string }>) {
    const prisma: any = {
      income: {
        findMany: jest.fn().mockResolvedValue(findManyResult),
        updateMany: jest.fn().mockResolvedValue({ count: findManyResult.length }),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', accountId: 'acc-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const cacheService: any = { del: jest.fn().mockResolvedValue(undefined) };
    return { service: new IncomeBulkService(prisma, cacheService), prisma };
  }

  it('sets the resolved category id when categoryId resolves', async () => {
    const { service, prisma } = makeService([{ id: 'inc-1' }]);
    // A UUID-shaped id that resolves via category.findUnique.
    await service.bulkUpdate('acc-1', { ids: ['inc-1'], categoryId: '11111111-1111-1111-1111-111111111111' });
    const data = prisma.income.updateMany.mock.calls[0][0].data;
    expect(data.categoryId).toBe('cat-1');
  });

  it('clears the category when categoryId is explicitly null', async () => {
    const { service, prisma } = makeService([{ id: 'inc-1' }]);
    await service.bulkUpdate('acc-1', { ids: ['inc-1'], categoryId: null });
    const data = prisma.income.updateMany.mock.calls[0][0].data;
    expect(data.categoryId).toBeNull();
  });

  it('leaves categoryId out of the update entirely when it does not resolve to any account category, so existing categories are never blanked', async () => {
    const prisma: any = {
      income: {
        findMany: jest.fn().mockResolvedValue([{ id: 'inc-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      category: {
        // A UUID that belongs to a DIFFERENT account, and no clientId match either.
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-x', accountId: 'other-acc' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const cacheService: any = { del: jest.fn() };
    const service = new IncomeBulkService(prisma, cacheService);

    await service.bulkUpdate('acc-1', { ids: ['inc-1'], categoryId: '22222222-2222-2222-2222-222222222222' });

    const data = prisma.income.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('categoryId');
  });

  it('does nothing to the category when categoryId is not provided', async () => {
    const { service, prisma } = makeService([{ id: 'inc-1' }]);
    await service.bulkUpdate('acc-1', { ids: ['inc-1'] });
    const data = prisma.income.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('categoryId');
  });
});
