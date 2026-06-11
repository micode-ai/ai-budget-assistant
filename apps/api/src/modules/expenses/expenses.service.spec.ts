import { ExpensesService } from './expenses.service';

// Regression for the bulk-delete bug: the mobile client uses local `clientId`s as
// its expense ids (offline-first), so bulkUpdate must resolve `ids` against BOTH the
// server PK `id` AND `clientId`. Matching only on `id` silently no-ops bulk
// delete/recategorize/tag for every synced (device-created) expense.
describe('ExpensesService.bulkUpdate id resolution', () => {
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
    const gamificationService: any = {};
    const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService);
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
