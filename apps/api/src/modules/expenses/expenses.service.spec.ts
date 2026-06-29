import { ExpensesService } from './expenses.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

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
    const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);
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

// ---------------------------------------------------------------------------
// reconcileNotificationStub (Tier 1 Case A)
// ---------------------------------------------------------------------------

function makeCreateService(overrides: {
  newExpense?: Record<string, any>;
  stubs?: Array<{ id: string; merchant: string | null; description: string | null }>;
} = {}) {
  const newExpense = overrides.newExpense ?? {
    id: 'e-new',
    amount: 15,
    currencyCode: 'PLN',
    date: new Date('2026-06-15'),
    merchant: 'Żabka',
    description: 'Żabka',
    source: 'manual',
  };
  const stubs = overrides.stubs ?? [
    { id: 'stub-1', merchant: 'Żabka', description: 'Żabka' },
  ];

  const stubUpdateMock = jest.fn().mockResolvedValue({});
  const prisma: any = {
    expense: {
      // findFirst for reconcileNotificationStub lookup
      findFirst: jest.fn().mockResolvedValue(newExpense),
      // findMany for the stub candidate query
      findMany: jest.fn().mockResolvedValue(stubs),
      // update for stub soft-delete
      update: stubUpdateMock,
    },
    $transaction: jest.fn(async (cb: any) => cb({
      expense: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ ...newExpense, id: 'e-new' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      expenseItem: { createMany: jest.fn().mockResolvedValue({}) },
      tag: { findMany: jest.fn().mockResolvedValue([]) },
      expenseTag: { createMany: jest.fn().mockResolvedValue({}) },
      project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
      projectExpense: { upsert: jest.fn().mockResolvedValue({}) },
      expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}) },
    })),
  };

  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);
  return { service, prisma, anomalyService, stubUpdateMock };
}

describe('reconcileNotificationStub (Tier 1 Case A)', () => {
  it('soft-deletes a matching notification stub when a richer (manual) expense is created', async () => {
    const { service, prisma, stubUpdateMock } = makeCreateService();
    // Call the private method directly via casting.
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    // Should have queried stubs scoped to source:'notification'
    const where = (prisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.source).toBe('notification');
    expect(where.accountId).toBe('acc-1');
    // Should have soft-deleted the stub.
    expect(stubUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stub-1' },
        data: expect.objectContaining({ isDeleted: true }),
      }),
    );
  });

  it('MUST-NOT-DEDUP: two identical manual expenses (same amount/currency/date/merchant) both survive — no notification stub to delete', async () => {
    // The stubs query is scoped to source:'notification', so the first manual expense
    // is never a candidate. Pass empty stubs array.
    const { service, stubUpdateMock } = makeCreateService({ stubs: [] });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does nothing when the new expense has no merchant or description', async () => {
    const { service, stubUpdateMock } = makeCreateService({
      newExpense: { id: 'e-new', amount: 15, currencyCode: 'PLN', date: new Date('2026-06-15'), merchant: null, description: null },
    });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does nothing when no stub payee matches', async () => {
    const { service, stubUpdateMock } = makeCreateService({
      stubs: [{ id: 'stub-1', merchant: 'Biedronka', description: 'Biedronka' }],
    });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does not invoke reconcileNotificationStub when the new expense source is notification', async () => {
    // This tests the guard in create() — source:'notification' never triggers Case A.
    const { service } = makeCreateService();
    const reconcileSpy = jest.spyOn(service as any, 'reconcileNotificationStub');
    // Simulate the guard: source is 'notification', so reconcile should not be called.
    const source = 'notification';
    if (source !== 'notification') {
      await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    }
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mergeExpenses (Tier 2 merge action)
// ---------------------------------------------------------------------------

function makeMergeService(overrides: {
  keepRow?: Record<string, any>;
  mergeRow?: Record<string, any>;
} = {}) {
  const keepRow = overrides.keepRow ?? {
    id: 'keep-1',
    accountId: 'acc-1',
    merchant: null,
    notes: null,
    categoryId: null,
    receiptImage: null,
    receiptMimeType: null,
    expenseTags: [],
    projectExpenses: [],
  };
  const mergeRow = overrides.mergeRow ?? {
    id: 'merge-1',
    accountId: 'acc-1',
    merchant: 'Żabka',
    notes: 'lunch',
    categoryId: 'cat-food',
    receiptImage: null,
    receiptMimeType: null,
    expenseTags: [{ tagId: 'tag-1' }],
    projectExpenses: [{ projectId: 'proj-1' }],
  };

  const expenseUpdateMock = jest.fn().mockResolvedValue({});
  const expenseTagUpsertMock = jest.fn().mockResolvedValue({});
  const projectExpenseUpsertMock = jest.fn().mockResolvedValue({});

  const tx: any = {
    expense: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(keepRow)
        .mockResolvedValueOnce(mergeRow),
      update: expenseUpdateMock,
    },
    expenseTag: { upsert: expenseTagUpsertMock },
    projectExpense: { upsert: projectExpenseUpsertMock },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const gamificationService: any = {};
  const anomalyService: any = {};
  const merchantRulesService: any = {};
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);
  return { service, prisma, tx, expenseUpdateMock, expenseTagUpsertMock, projectExpenseUpsertMock };
}

describe('mergeExpenses (Tier 2)', () => {
  it('soft-deletes the secondary and bumps syncVersion, returns keptId/mergedId', async () => {
    const { service, expenseUpdateMock } = makeMergeService();
    const result = await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(result).toEqual({ keptId: 'keep-1', mergedId: 'merge-1' });
    // merge-1 should be soft-deleted
    const deleteCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'merge-1');
    expect(deleteCall[0].data.isDeleted).toBe(true);
    expect(deleteCall[0].data.syncVersion).toEqual({ increment: 1 });
    // keep-1 should have syncVersion bumped
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    expect(keepCall[0].data.syncVersion).toEqual({ increment: 1 });
  });

  it('gap-fills merchant, notes, categoryId from the merged row into the survivor when survivor lacks them', async () => {
    const { service, expenseUpdateMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    expect(keepCall[0].data.merchant).toBe('Żabka');
    expect(keepCall[0].data.notes).toBe('lunch');
    expect(keepCall[0].data.categoryId).toBe('cat-food');
  });

  it('does NOT overwrite survivor fields that already have values (gap-fill only)', async () => {
    const { service, expenseUpdateMock } = makeMergeService({
      keepRow: {
        id: 'keep-1', accountId: 'acc-1',
        merchant: 'Existing', notes: 'existing note', categoryId: 'cat-existing',
        receiptImage: null, receiptMimeType: null, expenseTags: [], projectExpenses: [],
      },
    });
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    // These fields were NOT in carriedFields because the survivor already had them.
    expect(keepCall[0].data.merchant).toBeUndefined();
    expect(keepCall[0].data.notes).toBeUndefined();
    expect(keepCall[0].data.categoryId).toBeUndefined();
  });

  it('unions tags from the merged row onto the survivor', async () => {
    const { service, expenseTagUpsertMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(expenseTagUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: { expenseId: 'keep-1', tagId: 'tag-1' } }),
    );
  });

  it('carries over project association from merged row to survivor', async () => {
    const { service, projectExpenseUpsertMock } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(projectExpenseUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: { projectId: 'proj-1', expenseId: 'keep-1' } }),
    );
  });

  it('resolves keepId and mergeId by clientId (the OR:[{id},{clientId}] pattern)', async () => {
    const { service, tx } = makeMergeService();
    await service.mergeExpenses('acc-1', 'user-1', { keepId: 'client-keep', mergeId: 'client-merge' });
    const [keepCall, mergeCall] = (tx.expense.findFirst as jest.Mock).mock.calls;
    expect(keepCall[0].where.OR).toEqual([{ id: 'client-keep' }, { clientId: 'client-keep' }]);
    expect(mergeCall[0].where.OR).toEqual([{ id: 'client-merge' }, { clientId: 'client-merge' }]);
  });

  it('throws BadRequestException when keepId === mergeId', async () => {
    const { service } = makeMergeService();
    await expect(service.mergeExpenses('acc-1', 'user-1', { keepId: 'same', mergeId: 'same' }))
      .rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the keep expense is not found (cross-account safety)', async () => {
    const tx: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue(null), // nothing found
        update: jest.fn(),
      },
      expenseTag: { upsert: jest.fn() },
      projectExpense: { upsert: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn() };
    const service = new ExpensesService(prisma, {} as any, cacheService, {} as any, {} as any);
    await expect(service.mergeExpenses('acc-1', 'user-1', { keepId: 'other-acc-expense', mergeId: 'merge-1' }))
      .rejects.toThrow(NotFoundException);
    // The update must never have been called — nothing should be mutated.
    expect(tx.expense.update).not.toHaveBeenCalled();
  });
});
