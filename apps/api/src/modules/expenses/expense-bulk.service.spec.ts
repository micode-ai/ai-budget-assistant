import { ExpenseBulkService } from './expense-bulk.service';

// Regression for the bulk-delete bug: the mobile client uses local `clientId`s as
// its expense ids (offline-first), so bulkUpdate must resolve `ids` against BOTH the
// server PK `id` AND `clientId`. Matching only on `id` silently no-ops bulk
// delete/recategorize/tag for every synced (device-created) expense.
describe('ExpenseBulkService.bulkUpdate id resolution', () => {
  function makeService(
    findManyResult: Array<{ id: string }>,
    tagFindManyResult: Array<{ id: string }> = [],
  ) {
    const tx = {
      expense: { updateMany: jest.fn().mockResolvedValue({ count: findManyResult.length }) },
      tag: { findMany: jest.fn().mockResolvedValue(tagFindManyResult) },
      expenseTag: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      expense: { findMany: jest.fn().mockResolvedValue(findManyResult) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const cacheService: any = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExpenseBulkService(prisma, cacheService);
    return { service, prisma, tx };
  }

  it('resolves ids by clientId as well as server id when soft-deleting', async () => {
    // Client sends local clientIds; the matching server PKs are different.
    const { service, prisma, tx } = makeService([{ id: 'server-1' }, { id: 'server-2' }]);

    const res = await service.bulkUpdate('acc-1', {
      ids: ['client-1', 'client-2'],
      isDeleted: true,
    });

    // Lookup must match BOTH id and clientId.
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.accountId).toBe('acc-1');
    expect(where.isDeleted).toBe(false);
    expect(where.OR).toEqual([
      { id: { in: ['client-1', 'client-2'] } },
      { clientId: { in: ['client-1', 'client-2'] } },
    ]);

    // The update must run on the RESOLVED server PKs and set isDeleted.
    expect(tx.expense.updateMany).toHaveBeenCalledTimes(1);
    const upd = tx.expense.updateMany.mock.calls[0][0];
    expect(upd.where.id.in).toEqual(['server-1', 'server-2']);
    expect(upd.data.isDeleted).toBe(true);

    expect(res).toEqual({ updated: 2 });
  });

  it('returns {updated:0} and performs no update when nothing matches', async () => {
    const { service, tx } = makeService([]);

    const res = await service.bulkUpdate('acc-1', { ids: ['unknown'], isDeleted: true });

    expect(res).toEqual({ updated: 0 });
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
  });

  it('resolves tagIds by clientId and links the resolved server ids', async () => {
    // Both the expense ids and tag ids arrive as mobile clientIds.
    const { service, tx } = makeService(
      [{ id: 'server-exp-1' }], // resolved expense PK
      [{ id: 'server-tag-1' }], // resolved tag PK
    );

    await service.bulkUpdate('acc-1', { ids: ['client-exp-1'], tagIds: ['client-tag-1'] });

    // Tag lookup must resolve by id OR clientId.
    const tagWhere = tx.tag.findMany.mock.calls[0][0].where;
    expect(tagWhere.accountId).toBe('acc-1');
    expect(tagWhere.OR).toEqual([
      { id: { in: ['client-tag-1'] } },
      { clientId: { in: ['client-tag-1'] } },
    ]);

    // The junction row must use the RESOLVED server PKs, not the client ids.
    expect(tx.expenseTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { expenseId: 'server-exp-1', tagId: 'server-tag-1' } }),
    );
  });
});

describe('ExpenseBulkService.bulkUpdate merchant-rule learning', () => {
  function make(owned: Array<{ id: string; merchant: string | null }>) {
    const tx = { expense: { updateMany: jest.fn().mockResolvedValue({ count: owned.length }) } };
    const prisma: any = {
      expense: { findMany: jest.fn().mockResolvedValue(owned) },
      category: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', accountId: 'acc' }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn() };
    const merchantRules: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
    return { service: new ExpenseBulkService(prisma, cacheService, merchantRules), merchantRules };
  }

  it('upserts one rule per distinct non-empty merchant when a category is set', async () => {
    const { service, merchantRules } = make([
      { id: 'e1', merchant: 'OBI' },
      { id: 'e2', merchant: ' obi ' },
      { id: 'e3', merchant: null },
      { id: 'e4', merchant: 'Castorama' },
    ]);
    await service.bulkUpdate('acc', { ids: ['e1', 'e2', 'e3', 'e4'], categoryId: 'cat-1' });
    await new Promise((r) => setImmediate(r));
    const calls = merchantRules.upsertRule.mock.calls.map((c: any[]) => c.slice(1));
    expect(calls).toEqual([['obi', 'cat-1'], ['castorama', 'cat-1']]);
  });

  it('learns nothing when clearing a category or deleting', async () => {
    const { service, merchantRules } = make([{ id: 'e1', merchant: 'OBI' }]);
    await service.bulkUpdate('acc', { ids: ['e1'], categoryId: null });
    await service.bulkUpdate('acc', { ids: ['e1'], isDeleted: true });
    expect(merchantRules.upsertRule).not.toHaveBeenCalled();
  });
});
