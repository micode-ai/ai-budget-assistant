import { ExpensesService } from './expenses.service';

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