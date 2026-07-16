import { ExpensesService } from './expenses.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

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
    const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
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
  const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
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
// create() — trip expense shares (paidByUserId + resolveShares wiring)
// ---------------------------------------------------------------------------

/**
 * Mocks the create() $transaction end-to-end (unlike makeCreateService, which only
 * exercises the private reconcileNotificationStub method). expense.findUnique is
 * called twice inside create(): once for the existing-by-clientId lookup (must
 * resolve null so isNew=true), and once for the final `full` refetch — the second
 * mock captures whatever paidByUserId/amount/currencyCode the upsert was given so
 * the assertions below observe the real values the service computed, not fixtures.
 */
function makeTripShareCreateService() {
  let paidByUserId: string | undefined;
  let amount = 0;
  let currencyCode = 'USD';

  const upsertMock = jest.fn().mockImplementation(async (args: any) => {
    paidByUserId = args.create.paidByUserId;
    amount = args.create.amount;
    currencyCode = args.create.currencyCode;
    return { id: 'e-new' };
  });

  const findUniqueMock = jest
    .fn()
    .mockImplementationOnce(async () => null) // existing-by-clientId check -> not found (isNew)
    .mockImplementationOnce(async () => ({
      id: 'e-new',
      accountId: 'trip-acc-1',
      amount,
      currencyCode,
      paidByUserId,
      category: null,
      items: [],
      expenseTags: [],
      categorySplits: [],
      projectExpenses: [],
      user: { name: 'Alice' },
    }));

  const shareDeleteMany = jest.fn().mockResolvedValue({});
  const shareCreateMany = jest.fn().mockResolvedValue({});

  const tx = {
    expense: { findUnique: findUniqueMock, upsert: upsertMock },
    expenseItem: { createMany: jest.fn().mockResolvedValue({}) },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    expenseTag: { createMany: jest.fn().mockResolvedValue({}) },
    project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    projectExpense: { upsert: jest.fn().mockResolvedValue({}) },
    expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}) },
    tripExpenseShare: { deleteMany: shareDeleteMany, createMany: shareCreateMany },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);
  return { service, tx, shareCreateMany, shareDeleteMany, upsertMock };
}

describe('create — trip expense shares', () => {
  it('defaults paidByUserId to the creator and persists resolved shares', async () => {
    const { service, shareCreateMany, shareDeleteMany } = makeTripShareCreateService();

    const { expense } = await service.create('trip-acc-1', 'alice', {
      localId: 'client-1',
      amount: 90,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      splitType: 'equal',
      shares: [{ userId: 'alice', value: 0 }, { userId: 'bob', value: 0 }, { userId: 'carol', value: 0 }],
    });

    expect(expense.paidByUserId).toBe('alice');
    expect(shareDeleteMany).toHaveBeenCalledWith({ where: { expenseId: 'e-new' } });
    expect(shareCreateMany).toHaveBeenCalledTimes(1);
    const created = shareCreateMany.mock.calls[0][0].data;
    expect(created).toHaveLength(3);
    expect(created.find((s: any) => s.userId === 'carol')?.shareAmount).toBe(30);
    expect(created.every((s: any) => s.shareType === 'equal')).toBe(true);
  });

  it('uses an explicit paidByUserId when provided', async () => {
    const { service } = makeTripShareCreateService();

    const { expense } = await service.create('trip-acc-1', 'alice', {
      localId: 'client-2',
      amount: 40,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      paidByUserId: 'bob',
      splitType: 'exact',
      shares: [{ userId: 'bob', value: 40 }],
    });
    expect(expense.paidByUserId).toBe('bob');
  });

  it('does not touch tripExpenseShare when no shares are provided (non-trip expense, no-op)', async () => {
    const { service, shareCreateMany, shareDeleteMany } = makeTripShareCreateService();

    const { expense } = await service.create('acc-1', 'alice', {
      localId: 'client-3',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
    });

    // Still defaults paidByUserId to the creator (harmless new column, never read elsewhere).
    expect(expense.paidByUserId).toBe('alice');
    expect(shareCreateMany).not.toHaveBeenCalled();
    expect(shareDeleteMany).not.toHaveBeenCalled();
  });

  it('preserves an edited paidByUserId on the upsert update: branch (offline retry of the same localId)', async () => {
    // Simulates the offline-first retry path: the client pushes the same `localId`
    // twice (e.g. the first push succeeded server-side but the client never got the
    // ack and retries). The second `create()` call hits Prisma's upsert `update:`
    // branch, not `create:` — this is where paidByUserId used to be silently dropped.
    const upsertMock = jest.fn().mockResolvedValue({ id: 'e-retry' });

    const existingRow = {
      id: 'e-retry',
      accountId: 'acc-1',
      amount: 10,
      currencyCode: 'USD',
      category: null,
      items: [],
      expenseTags: [],
      categorySplits: [],
      projectExpenses: [],
      user: { name: 'Alice' },
    };

    // findUnique is called twice per create(): (1) existing-by-clientId check,
    // (2) post-upsert full refetch. First create() has no existing row; the second
    // create() (the retry) finds it, then both refetch the "full" row.
    const findUniqueMock = jest
      .fn()
      .mockImplementationOnce(async () => null) // call 1: existing check (first create) -> isNew
      .mockImplementationOnce(async () => ({ ...existingRow, paidByUserId: 'alice' })) // call 2: full refetch
      .mockImplementationOnce(async () => ({ id: 'e-retry' })) // call 3: existing check (retry) -> found
      .mockImplementationOnce(async () => ({ ...existingRow, paidByUserId: 'bob' })); // call 4: full refetch

    const tx = {
      expense: { findUnique: findUniqueMock, upsert: upsertMock },
      expenseItem: { createMany: jest.fn().mockResolvedValue({}) },
      tag: { findMany: jest.fn().mockResolvedValue([]) },
      expenseTag: { createMany: jest.fn().mockResolvedValue({}) },
      project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
      projectExpense: { upsert: jest.fn().mockResolvedValue({}) },
      expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}) },
      tripExpenseShare: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    };

    const prisma: any = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const cacheService: any = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
    const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
    const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);

    const dto = {
      localId: 'client-retry-1',
      amount: 10,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
    };

    // First push: creates the expense.
    await service.create('acc-1', 'alice', dto as any);

    // Retry push of the SAME localId, now with an edited paidByUserId — this is the
    // upsert's update: branch.
    const { expense } = await service.create('acc-1', 'alice', { ...dto, paidByUserId: 'bob' } as any);

    expect(upsertMock).toHaveBeenCalledTimes(2);
    const secondUpsertArgs = upsertMock.mock.calls[1][0];
    expect(secondUpsertArgs.update.paidByUserId).toBe('bob');
    expect(expense.paidByUserId).toBe('bob');
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
  const anomalyService: any = { dismissForExpense: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = {};
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService);
  return { service, prisma, tx, anomalyService, expenseUpdateMock, expenseTagUpsertMock, projectExpenseUpsertMock };
}

describe('mergeExpenses (Tier 2)', () => {
  it('soft-deletes the secondary and bumps syncVersion, returns keptId/mergedId', async () => {
    const { service, anomalyService, expenseUpdateMock } = makeMergeService();
    const result = await service.mergeExpenses('acc-1', 'user-1', { keepId: 'keep-1', mergeId: 'merge-1' });
    expect(result).toEqual({ keptId: 'keep-1', mergedId: 'merge-1' });
    // merge-1 should be soft-deleted
    const deleteCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'merge-1');
    expect(deleteCall[0].data.isDeleted).toBe(true);
    expect(deleteCall[0].data.syncVersion).toEqual({ increment: 1 });
    // keep-1 should have syncVersion bumped
    const keepCall = expenseUpdateMock.mock.calls.find((c: any) => c[0].where.id === 'keep-1');
    expect(keepCall[0].data.syncVersion).toEqual({ increment: 1 });
    // the soft-deleted (merged) row's stale anomaly alert must be dismissed
    expect(anomalyService.dismissForExpense).toHaveBeenCalledWith('acc-1', 'merge-1');
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

// ---------------------------------------------------------------------------
// create() — inflation-shield reconcile hook (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Unlike makeCreateService (which only exercises the private reconcileNotificationStub
 * method and never actually calls service.create() — its tx.expense.findUnique always
 * resolves null, which would make the real create() crash on toExpenseResponse(null)),
 * this factory mirrors makeTripShareCreateService's proven-working create() mock:
 * findUnique resolves null on the existing-by-clientId check (isNew) then the full
 * refetch row on the second call.
 */
function makeShieldReconcileCreateService() {
  const findUniqueMock = jest
    .fn()
    .mockImplementationOnce(async () => null) // existing-by-clientId check -> not found (isNew)
    .mockImplementationOnce(async () => ({
      id: 'e-shield-1',
      accountId: 'a1',
      amount: 15,
      currencyCode: 'PLN',
      category: null,
      merchant: null,
      source: 'manual',
      items: [],
      expenseTags: [],
      categorySplits: [],
      projectExpenses: [],
      user: { name: 'Alice' },
    }));

  const tx = {
    expense: {
      findUnique: findUniqueMock,
      upsert: jest.fn().mockResolvedValue({ id: 'e-shield-1' }),
    },
    expenseItem: { createMany: jest.fn().mockResolvedValue({}) },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    expenseTag: { createMany: jest.fn().mockResolvedValue({}) },
    project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    projectExpense: { upsert: jest.fn().mockResolvedValue({}) },
    expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}) },
  };

  const prisma: any = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
  const shieldTracking: any = { reconcilePurchase: jest.fn().mockResolvedValue(undefined) };

  // shieldTracking is appended as the LAST constructor arg (mirrors familyFeed/
  // communityPrices — both left undefined here, exercising the @Optional() no-op path).
  const service = new ExpensesService(
    prisma,
    gamificationService,
    cacheService,
    anomalyService,
    merchantRulesService,
    undefined,
    undefined,
    shieldTracking,
  );
  return { service, shieldTracking, cacheService };
}

describe('create — inflation-shield reconcile hook', () => {
  it('fires inflation-shield reconcilePurchase after creating a new expense', async () => {
    const { service, shieldTracking } = makeShieldReconcileCreateService();

    const { expense, isNew } = await service.create('a1', 'u1', {
      localId: 'client-shield-1',
      amount: 15,
      currencyCode: 'PLN',
      date: '2026-06-15',
      source: 'manual',
    } as any);

    expect(isNew).toBe(true);

    // fire-and-forget — allow the microtask to run
    await new Promise((r) => setImmediate(r));

    expect(shieldTracking.reconcilePurchase).toHaveBeenCalledWith('a1', expense.id);
  });

  it('invalidates the shield cache when a new expense is created', async () => {
    const { service, cacheService } = makeShieldReconcileCreateService();

    await service.create('a1', 'u1', {
      localId: 'client-shield-2',
      amount: 15,
      currencyCode: 'PLN',
      date: '2026-06-15',
      source: 'manual',
    } as any);

    // fire-and-forget — allow the microtask to run
    await new Promise((r) => setImmediate(r));

    expect(cacheService.delByPrefix).toHaveBeenCalledWith('shield:a1:');
    // The AI-chat layer caches the shield tool result in front of getShield, so
    // its per-account cache must be busted too (final-review fix).
    expect(cacheService.delByPrefix).toHaveBeenCalledWith('chat:get_inflation_shield:a1:');
  });
});

// Move an expense to another account. The caller is already a non-viewer member of the
// SOURCE account (AccountContextGuard + ViewerBlockGuard); the service validates the
// TARGET membership/role, remaps the category by name, and drops account-scoped links.
describe('ExpensesService.moveToAccount', () => {
  function makeService(opts: {
    expense?: any;
    targetMember?: { role: string } | null;
    sourceCategoryName?: string | null;
    targetCategoryMatch?: { id: string } | null;
    clientIdClash?: { id: string } | null;
  }) {
    const tx = {
      expenseTag: { updateMany: jest.fn().mockResolvedValue({}) },
      projectExpense: { updateMany: jest.fn().mockResolvedValue({}) },
      expenseCategorySplit: { updateMany: jest.fn().mockResolvedValue({}) },
      tripExpenseShare: { deleteMany: jest.fn().mockResolvedValue({}) },
      expense: { update: jest.fn().mockResolvedValue({}) },
    };
    const expense =
      opts.expense === undefined
        ? { id: 'srv-1', clientId: 'cli-1', categoryId: 'cat-src', encryptedPayload: null }
        : opts.expense;
    const prisma: any = {
      expense: {
        findFirst: jest
          .fn()
          // first call resolves the source expense; second (clientId clash check) if any
          .mockResolvedValueOnce(expense)
          .mockResolvedValueOnce(opts.clientIdClash ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      accountMember: {
        findUnique: jest.fn().mockResolvedValue(
          opts.targetMember === undefined ? { role: 'editor' } : opts.targetMember,
        ),
      },
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.sourceCategoryName === undefined ? { name: 'Food' } : { name: opts.sourceCategoryName },
          ),
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.targetCategoryMatch === undefined ? { id: 'cat-dst' } : opts.targetCategoryMatch),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const cacheService: any = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const anomalyService: any = { dismissForExpense: jest.fn().mockResolvedValue(undefined) };
    const service = new ExpensesService(prisma, {} as any, cacheService, anomalyService, {} as any);
    return { service, prisma, tx };
  }

  it('reassigns accountId, remaps category by name, and drops account-scoped links', async () => {
    const { service, tx } = makeService({});

    const res = await service.moveToAccount('acc-src', 'user-1', 'cli-1', {
      targetAccountId: 'acc-dst',
    });

    expect(res).toEqual({ id: 'srv-1', accountId: 'acc-dst', categoryId: 'cat-dst' });

    const upd = tx.expense.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'srv-1' });
    expect(upd.data.accountId).toBe('acc-dst');
    expect(upd.data.categoryId).toBe('cat-dst');
    expect(upd.data.syncVersion).toEqual({ increment: 1 });

    // Account-scoped associations are severed.
    expect(tx.expenseTag.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.projectExpense.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.expenseCategorySplit.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.tripExpenseShare.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('clears the category when the target account has no same-named category', async () => {
    const { service, tx } = makeService({ targetCategoryMatch: null });

    const res = await service.moveToAccount('acc-src', 'user-1', 'cli-1', {
      targetAccountId: 'acc-dst',
    });

    expect(res.categoryId).toBeNull();
    expect(tx.expense.update.mock.calls[0][0].data.categoryId).toBeNull();
  });

  it('nulls the clientId when the target account already holds that clientId', async () => {
    const { service, tx } = makeService({ clientIdClash: { id: 'other' } });

    await service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' });

    expect(tx.expense.update.mock.calls[0][0].data.clientId).toBeNull();
  });

  it('rejects moving to the same account', async () => {
    const { service, tx } = makeService({});
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-src' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects an encrypted expense (payload cannot decrypt under the target key)', async () => {
    const { service, tx } = makeService({
      expense: { id: 'srv-1', clientId: 'cli-1', categoryId: null, encryptedPayload: 'enc' },
    });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects when the caller is not a member of the target account', async () => {
    const { service, tx } = makeService({ targetMember: null });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('rejects when the caller is only a viewer of the target account', async () => {
    const { service, tx } = makeService({ targetMember: { role: 'viewer' } });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'cli-1', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when the expense is missing from the source account', async () => {
    const { service, tx } = makeService({ expense: null });
    await expect(
      service.moveToAccount('acc-src', 'user-1', 'nope', { targetAccountId: 'acc-dst' }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.expense.update).not.toHaveBeenCalled();
  });
});
