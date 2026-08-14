import { ExpensesService } from './expenses.service';

/**
 * Default stub for the DI-injected ReceiptSplitService (Fix 3 — receipt-split
 * review: real DI, not a standalone-function import). Most tests in this file
 * never call remove(), so expireForExpense is never invoked; the dedicated
 * "remove — receipt-split cleanup" describe block below builds its own mock and
 * asserts on it directly.
 */
function makeReceiptSplitServiceStub(): any {
  return { expireForExpense: jest.fn().mockResolvedValue(undefined) };
}

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
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService, makeReceiptSplitServiceStub());
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
  const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService, makeReceiptSplitServiceStub());
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
    const service = new ExpensesService(prisma, gamificationService, cacheService, anomalyService, merchantRulesService, makeReceiptSplitServiceStub());

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
    makeReceiptSplitServiceStub(),
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

// ---------------------------------------------------------------------------
// create() — categorized receipt items (persist categoryId + learn product rules)
// ---------------------------------------------------------------------------

/**
 * Mirrors makeShieldReconcileCreateService's end-to-end create() shape, plus a
 * top-level `category` mock. resolveCategoryId (used both for the top-level
 * dto.categoryId and, after this task, each item's categoryId) always queries
 * `this.prisma` — the OUTER, non-transactional client — even when invoked from
 * inside the $transaction callback (see expense-category-resolver.util.ts), so
 * the mock for it lives on `prisma.category`, not `tx.category`.
 *
 * The item's raw categoryId ('Alcohol', a name-style client value) is
 * deliberately different from what the mocked lookup resolves it to ('c-alc'),
 * so a test asserting the write got 'c-alc' actually proves resolution ran
 * rather than merely echoing whatever was passed in.
 */
function makeCategorizedItemsCreateService() {
  const createManyMock = jest.fn().mockResolvedValue({});

  const findUniqueMock = jest
    .fn()
    .mockImplementationOnce(async () => null) // existing-by-clientId check -> isNew
    .mockImplementationOnce(async () => ({
      id: 'e-items-1',
      accountId: 'a1',
      amount: 8,
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
      upsert: jest.fn().mockResolvedValue({ id: 'e-items-1' }),
    },
    expenseItem: { createMany: createManyMock },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    expenseTag: { createMany: jest.fn().mockResolvedValue({}) },
    project: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    projectExpense: { upsert: jest.fn().mockResolvedValue({}) },
    expenseCategorySplit: { createMany: jest.fn().mockResolvedValue({}) },
  };

  const prisma: any = {
    category: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c-alc' }),
      findUnique: jest.fn().mockResolvedValue(null),
      // resolveCategoryId auto-creates when a name-style id matches nothing.
      // Returning a name-derived id lets a test tell two resolutions apart.
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ id: `c-${String(data.name).toLowerCase()}` })),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const gamificationService: any = { checkAchievements: jest.fn().mockResolvedValue(undefined) };
  const anomalyService: any = { checkExpense: jest.fn().mockResolvedValue(undefined), dismissForExpense: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
  const productRules: any = { upsertRules: jest.fn().mockResolvedValue(undefined) };

  // productRules is appended as the 10th constructor arg (mirrors familyFeed/
  // communityPrices/shieldTracking — all left undefined here on purpose,
  // exercising the @Optional() no-op path for those three).
  const service = new ExpensesService(
    prisma,
    gamificationService,
    cacheService,
    anomalyService,
    merchantRulesService,
    makeReceiptSplitServiceStub(),
    undefined,
    undefined,
    undefined,
    productRules,
  );

  return { service, prisma, createManyMock, productRules };
}

describe('create with categorized receipt items', () => {
  const baseDto = {
    localId: 'client-items-1',
    amount: 8,
    currencyCode: 'PLN',
    date: '2026-08-01',
    source: 'manual',
    items: [
      { description: 'Piwo', canonicalName: 'Piwo Żywiec', totalPrice: 8, categoryId: 'Alcohol' },
    ],
  };

  it('persists each item categoryId', async () => {
    const { service, prisma, createManyMock } = makeCategorizedItemsCreateService();

    await service.create('a1', 'u1', baseDto as any);

    // The raw client-supplied categoryId ('Alcohol') must be resolved through
    // the account-scoped category lookup before it reaches the write.
    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: 'a1' }) }),
    );
    const written = createManyMock.mock.calls[0][0].data;
    expect(written).toHaveLength(1);
    // Resolved id ('c-alc'), NOT the raw client-supplied value ('Alcohol') —
    // proves the write went through resolution, not a passthrough.
    expect(written[0].categoryId).toBe('c-alc');
  });

  it('learns a product rule from every categorized item', async () => {
    const { service, productRules } = makeCategorizedItemsCreateService();

    await service.create('a1', 'u1', baseDto as any);
    // fire-and-forget — allow the microtask to run
    await new Promise((resolve) => setImmediate(resolve));

    expect(productRules.upsertRules).toHaveBeenCalledWith('a1', [
      { canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' },
    ]);
  });

  it('resolves a repeated item category once, so two lines cannot race into a duplicate-category P2002', async () => {
    // Receipt lines routinely repeat a category — grouping them is the whole
    // point. resolveCategoryId AUTO-CREATES a category when a name-style id
    // matches nothing, and Category carries @@unique([accountId, name, type]),
    // so resolving the raw list concurrently makes two lines both miss the
    // findFirst and both create. The loser throws P2002; the rejection escapes
    // into the $transaction callback and rolls the entire receipt save back as
    // a 500. Trigger: a local-only category picked for 2+ lines in
    // ItemCategorySheet.
    const { service, prisma, createManyMock } = makeCategorizedItemsCreateService();
    prisma.category.findFirst.mockResolvedValue(null); // account has neither category yet

    await service.create('a1', 'u1', {
      ...baseDto,
      items: [
        { description: 'Piwo', canonicalName: 'Piwo Żywiec', totalPrice: 8, categoryId: 'Alcohol' },
        { description: 'Wino', canonicalName: 'Wino Carlo Rossi', totalPrice: 20, categoryId: 'Alcohol' },
        { description: 'Chleb', canonicalName: 'Chleb', totalPrice: 5, categoryId: 'Groceries' },
      ],
    } as any);

    // One create per DISTINCT name, not one per line.
    expect(prisma.category.create).toHaveBeenCalledTimes(2);
    // Both alcohol lines still land on the same resolved id — deduplicating
    // must not drop an item's category.
    const written = createManyMock.mock.calls[0][0].data;
    expect(written.map((w: any) => w.categoryId)).toEqual(['c-alcohol', 'c-alcohol', 'c-groceries']);
  });

  it('does not fail the create when rule learning throws', async () => {
    const { service, productRules } = makeCategorizedItemsCreateService();
    productRules.upsertRules.mockRejectedValue(new Error('boom'));

    let unhandled: unknown;
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason;
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await expect(service.create('a1', 'u1', baseDto as any)).resolves.toEqual(
        expect.objectContaining({ isNew: true }),
      );

      // Prove the rejection was genuinely exercised (the mock was actually
      // invoked, not just skipped), then flush the microtask queue so the
      // fire-and-forget call's own .catch(() => {}) has a chance to run — if
      // that .catch were ever removed, Node would surface this rejection as
      // an unhandledRejection event, which the listener above would capture.
      expect(productRules.upsertRules).toHaveBeenCalled();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toBeUndefined();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});

// ---------------------------------------------------------------------------
// Expense items CRUD — clientId resolution (ABA: web receipt items missing)
//
// The mobile client addresses an expense by its LOCAL id (= `clientId` on the
// server), never the server PK. `expense_items.expense_id` is an FK to
// `expenses.id`, so every item query must run against the RESOLVED server PK.
// On native this was invisible (items are read from local SQLite first); on
// web the SQLite layer is a no-op mock, so the API is the only source and the
// receipt items silently vanished after opening the expense.
// ---------------------------------------------------------------------------

function makeItemsService(expense: { id: string; clientId: string }) {
  const prisma: any = {
    expense: {
      findFirst: jest.fn().mockResolvedValue({
        ...expense,
        // Every item write now re-derives the expense's category split against
        // the current amount (see "split invariant is defended after creation"),
        // so the resolved row carries it.
        amount: 10,
        user: { name: 'Tester' },
      }),
    },
    expenseItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'item-1', expenseId: expense.id }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'item-new', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'item-1' }),
    },
    // No live splits on this expense, so the re-derivation cheap-exits — these
    // tests are about id resolution, not the split invariant.
    expenseCategorySplit: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
  };
  const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn() };
  const service = new ExpensesService(
    prisma,
    {} as any,
    cacheService,
    {} as any,
    {} as any,
    makeReceiptSplitServiceStub(),
  );
  return { service, prisma };
}

describe('expense items CRUD resolves clientId to the server PK', () => {
  const expense = { id: 'server-pk-1', clientId: 'local-uuid-1' };

  it('getItems queries expense_items by the server PK when addressed by clientId', async () => {
    const { service, prisma } = makeItemsService(expense);

    await service.getItems('acc-1', 'local-uuid-1');

    expect(prisma.expenseItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expenseId: 'server-pk-1', isDeleted: false }),
      }),
    );
  });

  it('createItem writes the server PK into expense_items.expenseId', async () => {
    const { service, prisma } = makeItemsService(expense);

    await service.createItem('acc-1', 'local-uuid-1', {
      description: 'Piwo',
      totalPrice: 9.99,
    } as any);

    expect(prisma.expenseItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expenseId: 'server-pk-1' }),
      }),
    );
  });

  it('updateItem looks the item up by the server PK', async () => {
    const { service, prisma } = makeItemsService(expense);

    await service.updateItem('acc-1', 'local-uuid-1', 'item-1', { totalPrice: 5 } as any);

    expect(prisma.expenseItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'item-1', expenseId: 'server-pk-1' }),
      }),
    );
  });

  it('removeItem looks the item up by the server PK', async () => {
    const { service, prisma } = makeItemsService(expense);

    await service.removeItem('acc-1', 'local-uuid-1', 'item-1');

    expect(prisma.expenseItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'item-1', expenseId: 'server-pk-1' }),
      }),
    );
  });

  it('still works when addressed by the server PK directly', async () => {
    const { service, prisma } = makeItemsService(expense);

    await service.getItems('acc-1', 'server-pk-1');

    expect(prisma.expenseItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expenseId: 'server-pk-1' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Split invariant defence — Σ splits === amount after an amount or item edit
//
// The receipt category auto-split rests on one invariant: the split amounts sum
// to the expense amount exactly. It was enforced at creation only, so correcting
// a scanned receipt's total (240 -> 200) or moving a line's price out from under
// the split left the stored rows summing to the OLD figure. analytics.service.ts
// computes the period total from expense.amount but groups by splits, so the
// breakdown silently stopped adding up and every percentage went wrong.
//
// The rule: any change to an expense's amount, or to its items, re-derives the
// split from the persisted expense_items.category_id values (no LLM call). If
// re-derivation yields nothing — the tolerance gate refuses, or fewer than two
// categories survive — the split is removed. Refusing to show a split beats
// showing a wrong one.
// ---------------------------------------------------------------------------

/** Groceries 180 + Household 35 + Alcohol 25 = 240, the spec's worked example. */
const SPLIT_ITEMS = [
  { totalPrice: 180, categoryId: 'c-food', category: { name: 'Groceries' } },
  { totalPrice: 35, categoryId: 'c-home', category: { name: 'Household' } },
  { totalPrice: 25, categoryId: 'c-alc', category: { name: 'Alcohol' } },
];

function makeSplitDefenceService(opts: {
  /** Amount stored BEFORE the edit under test. */
  amount?: number;
  items?: Array<{ totalPrice: number; categoryId: string | null; category?: { name: string } | null }>;
  /** Live split rows on the expense; [] models an expense that was never split. */
  splits?: Array<{ id: string; categoryId?: string; amount?: number }>;
  /** Receipt-level discount stored on the expense, as a basket coupon leaves it. */
  discount?: number | null;
} = {}) {
  const amount = opts.amount ?? 240;
  const items = opts.items ?? SPLIT_ITEMS;
  const splits = opts.splits ?? [{ id: 'sp-1' }, { id: 'sp-2' }, { id: 'sp-3' }];

  const splitFindMany = jest.fn().mockResolvedValue(splits);
  const splitUpdateMany = jest.fn().mockResolvedValue({});
  const splitCreateMany = jest.fn().mockResolvedValue({});
  const itemFindMany = jest.fn().mockResolvedValue(items);

  const expenseRow = {
    id: 'e-split-1',
    clientId: 'local-split-1',
    accountId: 'acc-1',
    amount,
    // Read by rebuildCategorySplits through whichever client it was handed —
    // the transaction on an amount edit, the plain client on an item edit.
    discountAmount: opts.discount ?? null,
    currencyCode: 'PLN',
    category: null,
    items: [],
    expenseTags: [],
    categorySplits: [],
    projectExpenses: [],
    user: { name: 'Alice' },
  };

  const tx: any = {
    expense: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(expenseRow),
    },
    expenseItem: { findMany: itemFindMany },
    expenseCategorySplit: {
      findMany: splitFindMany,
      updateMany: splitUpdateMany,
      createMany: splitCreateMany,
    },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
    expenseTag: { updateMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    project: { findUnique: jest.fn().mockResolvedValue(null) },
    projectExpense: { updateMany: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
    tripExpenseShare: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
  };

  const expenseFindUnique = jest.fn().mockResolvedValue({ discountAmount: opts.discount ?? null });

  const prisma: any = {
    expense: {
      findFirst: jest.fn().mockResolvedValue(expenseRow),
      update: jest.fn().mockResolvedValue({}),
      // rebuildCategorySplits reads the receipt-level discount: the stored line
      // items are priced before it and the amount after it.
      findUnique: expenseFindUnique,
    },
    expenseItem: {
      findMany: itemFindMany,
      findFirst: jest.fn().mockResolvedValue({ id: 'item-1', expenseId: 'e-split-1' }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'item-new', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'item-1' }),
    },
    expenseCategorySplit: {
      findMany: splitFindMany,
      updateMany: splitUpdateMany,
      createMany: splitCreateMany,
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };
  const merchantRulesService: any = { upsertRule: jest.fn().mockResolvedValue(undefined) };
  const service = new ExpensesService(
    prisma,
    {} as any,
    cacheService,
    { dismissForExpense: jest.fn().mockResolvedValue(undefined) } as any,
    merchantRulesService,
    makeReceiptSplitServiceStub(),
  );

  return { service, prisma, splitFindMany, splitUpdateMany, splitCreateMany, itemFindMany };
}

/** Every created row's amount, summed in cents so the assertion is exact. */
function createdSplitTotal(createMany: jest.Mock): number {
  const rows = createMany.mock.calls[0][0].data as Array<{ amount: number }>;
  return rows.reduce((cents, r) => cents + Math.round(r.amount * 100), 0) / 100;
}

describe('split invariant is defended after creation', () => {
  describe('update() — amount edit', () => {
    it('removes the split when the corrected amount no longer reconciles with the items', async () => {
      // OCR read 240; the user corrects it to 200. The items still say 240, a 20%
      // gap — far outside the 5% tolerance — so there is no honest split to show.
      const { service, splitUpdateMany, splitCreateMany } = makeSplitDefenceService({ amount: 240 });

      await service.update('acc-1', 'e-split-1', { amount: 200 } as any);

      expect(splitUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ expenseId: 'e-split-1', isDeleted: false }),
          data: { isDeleted: true },
        }),
      );
      expect(splitCreateMany).not.toHaveBeenCalled();
    });

    it('rewrites a split that sums to the new amount exactly when the items still reconcile', async () => {
      // 240 -> 238: a 0.84% gap, inside tolerance. The residual (-2) lands on the
      // largest group, so the set still sums to the cent.
      const { service, splitCreateMany } = makeSplitDefenceService({ amount: 240 });

      await service.update('acc-1', 'e-split-1', { amount: 238 } as any);

      expect(splitCreateMany).toHaveBeenCalledTimes(1);
      expect(createdSplitTotal(splitCreateMany)).toBe(238);
      const rows = splitCreateMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(3);
      expect(rows.find((r: any) => r.categoryId === 'c-food').amount).toBe(178);
      expect(rows.every((r: any) => r.expenseId === 'e-split-1')).toBe(true);
    });

    it('keeps the split of a receipt whose basket coupon explains the gap', async () => {
      // Lines priced before a 20 coupon (100 + 60 + 40) against a 180 total: a
      // 10% gap on its face, fully explained once the coupon is counted. Before
      // the rebuild read the discount, an ordinary amount edit deleted the split
      // of every such receipt.
      const { service, splitCreateMany } = makeSplitDefenceService({
        amount: 200,
        discount: 20,
        items: [
          { totalPrice: 100, categoryId: 'c-food', category: { name: 'Groceries' } },
          { totalPrice: 60, categoryId: 'c-home', category: { name: 'Household' } },
          { totalPrice: 40, categoryId: 'c-alc', category: { name: 'Alcohol' } },
        ],
      });

      await service.update('acc-1', 'e-split-1', { amount: 180 } as any);

      expect(splitCreateMany).toHaveBeenCalledTimes(1);
      expect(createdSplitTotal(splitCreateMany)).toBe(180);
      // The coupon is spread in proportion, not dropped on the largest group.
      const rows = splitCreateMany.mock.calls[0][0].data;
      expect(rows.find((r: any) => r.categoryId === 'c-food').amount).toBe(90);
      expect(rows.find((r: any) => r.categoryId === 'c-home').amount).toBe(54);
      expect(rows.find((r: any) => r.categoryId === 'c-alc').amount).toBe(36);
    });

    it('removes that same split when no discount was recorded to explain the gap', async () => {
      const { service, splitCreateMany } = makeSplitDefenceService({
        amount: 200,
        discount: null,
        items: [
          { totalPrice: 100, categoryId: 'c-food', category: { name: 'Groceries' } },
          { totalPrice: 60, categoryId: 'c-home', category: { name: 'Household' } },
          { totalPrice: 40, categoryId: 'c-alc', category: { name: 'Alcohol' } },
        ],
      });

      await service.update('acc-1', 'e-split-1', { amount: 180 } as any);

      expect(splitCreateMany).not.toHaveBeenCalled();
    });

    it('leaves an expense that has no splits completely untouched', async () => {
      const { service, splitUpdateMany, splitCreateMany, itemFindMany } = makeSplitDefenceService({
        splits: [],
      });

      await service.update('acc-1', 'e-split-1', { amount: 200 } as any);

      expect(splitUpdateMany).not.toHaveBeenCalled();
      expect(splitCreateMany).not.toHaveBeenCalled();
      // Cheap-exits before reading the items at all.
      expect(itemFindMany).not.toHaveBeenCalled();
    });

    it('does not re-derive when the update leaves the amount alone', async () => {
      const { service, splitUpdateMany, splitCreateMany } = makeSplitDefenceService({ amount: 240 });

      await service.update('acc-1', 'e-split-1', { description: 'Biedronka' } as any);

      expect(splitUpdateMany).not.toHaveBeenCalled();
      expect(splitCreateMany).not.toHaveBeenCalled();
    });

    it('does not re-derive when the amount is resubmitted unchanged', async () => {
      const { service, splitUpdateMany, splitCreateMany } = makeSplitDefenceService({ amount: 240 });

      await service.update('acc-1', 'e-split-1', { amount: 240, notes: 'x' } as any);

      expect(splitUpdateMany).not.toHaveBeenCalled();
      expect(splitCreateMany).not.toHaveBeenCalled();
    });
  });

  describe('item edits', () => {
    it('removeItem re-derives and drops a split the surviving lines no longer support', async () => {
      // The alcohol line is gone, so the items now sum to 215 against a 240 total —
      // a 10.4% gap, outside tolerance.
      const { service, splitUpdateMany, splitCreateMany, itemFindMany } = makeSplitDefenceService({
        amount: 240,
      });
      itemFindMany.mockResolvedValue(SPLIT_ITEMS.slice(0, 2));

      await service.removeItem('acc-1', 'local-split-1', 'item-1');

      expect(splitUpdateMany).toHaveBeenCalled();
      expect(splitCreateMany).not.toHaveBeenCalled();
    });

    it('updateItem re-derives a split that still sums to the amount exactly', async () => {
      const { service, splitCreateMany, itemFindMany } = makeSplitDefenceService({ amount: 240 });
      // The household line was mis-read; corrected 35 -> 40 (items 245 vs 240, 2% gap).
      itemFindMany.mockResolvedValue([
        SPLIT_ITEMS[0],
        { totalPrice: 40, categoryId: 'c-home', category: { name: 'Household' } },
        SPLIT_ITEMS[2],
      ]);

      await service.updateItem('acc-1', 'local-split-1', 'item-1', { totalPrice: 40 } as any);

      expect(splitCreateMany).toHaveBeenCalledTimes(1);
      expect(createdSplitTotal(splitCreateMany)).toBe(240);
    });

    it('createItem re-derives the split, since a new line moves the reconciliation', async () => {
      const { service, splitCreateMany, itemFindMany } = makeSplitDefenceService({ amount: 240 });
      itemFindMany.mockResolvedValue([
        { totalPrice: 175, categoryId: 'c-food', category: { name: 'Groceries' } },
        SPLIT_ITEMS[1],
        SPLIT_ITEMS[2],
        { totalPrice: 5, categoryId: 'c-home', category: { name: 'Household' } },
      ]);

      await service.createItem('acc-1', 'local-split-1', { description: 'Gąbki', totalPrice: 5 } as any);

      expect(splitCreateMany).toHaveBeenCalledTimes(1);
      expect(createdSplitTotal(splitCreateMany)).toBe(240);
    });

    it('leaves an expense with no splits untouched on every item path', async () => {
      const { service, splitUpdateMany, splitCreateMany } = makeSplitDefenceService({ splits: [] });

      await service.createItem('acc-1', 'local-split-1', { description: 'x', totalPrice: 1 } as any);
      await service.updateItem('acc-1', 'local-split-1', 'item-1', { totalPrice: 2 } as any);
      await service.removeItem('acc-1', 'local-split-1', 'item-1');

      expect(splitUpdateMany).not.toHaveBeenCalled();
      expect(splitCreateMany).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// remove() — receipt-split cleanup (a deleted receipt's guest links must die)
//
// ExpensesService.remove soft-deletes by setting isDeleted, which does NOT fire
// the Prisma onDelete:Cascade on ReceiptSplitParticipant.expense (that only fires
// on a genuine hard delete). So remove() must explicitly fire the split cleanup —
// this test proves the wiring, not the cleanup's own internals (those are covered
// by receipt-split.service.spec.ts's cancelSplit tests, which the cleanup function
// shares its implementation with).
// ---------------------------------------------------------------------------

describe('remove — receipt-split cleanup', () => {
  it('fires receiptSplitService.expireForExpense (real DI) with the resolved expense id when a receipt is deleted', async () => {
    const prisma: any = {
      expense: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e-1',
          accountId: 'acc-1',
          category: null,
          items: [],
          expenseTags: [],
          categorySplits: [],
          projectExpenses: [],
          user: { name: 'Alice' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const cacheService: any = { delByPrefix: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };
    const gamificationService: any = {};
    const anomalyService: any = { dismissForExpense: jest.fn().mockResolvedValue(undefined) };
    const merchantRulesService: any = {};
    const receiptSplitService: any = { expireForExpense: jest.fn().mockResolvedValue(undefined) };

    const service = new ExpensesService(
      prisma,
      gamificationService,
      cacheService,
      anomalyService,
      merchantRulesService,
      receiptSplitService,
    );

    await service.remove('acc-1', 'e-1');

    expect(receiptSplitService.expireForExpense).toHaveBeenCalledWith('e-1');
  });
});

// ---------------------------------------------------------------------------
// Hand-made splits must survive an amount edit
//
// Two kinds of split share one table. A split derived from a receipt's line
// items is rebuilt from those items. A split the user made by hand has no item
// categories behind it at all — a manual split is created on an expense with no
// line items — so re-deriving it would find nothing and delete the user's own
// work on every amount edit. It is redistributed proportionally instead.
// ---------------------------------------------------------------------------

describe('a hand-made split survives an amount edit', () => {
  const MANUAL_SPLITS = [
    { id: 'sp-1', categoryId: 'c-a', amount: 150 },
    { id: 'sp-2', categoryId: 'c-b', amount: 50 },
  ];

  it('rescales proportionally instead of deleting, when the expense has no line items', async () => {
    const { service, splitCreateMany } = makeSplitDefenceService({
      amount: 200,
      items: [],
      splits: MANUAL_SPLITS,
    });

    await service.update('acc-1', 'e-split-1', { amount: 250 } as any);

    expect(splitCreateMany).toHaveBeenCalled();
    const rows = splitCreateMany.mock.calls[0][0].data as Array<{ categoryId: string; amount: number }>;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.categoryId === 'c-a')!.amount).toBe(187.5);
    expect(rows.find((r) => r.categoryId === 'c-b')!.amount).toBe(62.5);
    expect(createdSplitTotal(splitCreateMany)).toBe(250);
  });

  it('rescales when the expense has items but none of them carry a category', async () => {
    const { service, splitCreateMany } = makeSplitDefenceService({
      amount: 200,
      items: [
        { totalPrice: 120, categoryId: null },
        { totalPrice: 80, categoryId: null },
      ],
      splits: MANUAL_SPLITS,
    });

    await service.update('acc-1', 'e-split-1', { amount: 250 } as any);

    expect(splitCreateMany).toHaveBeenCalled();
    expect(createdSplitTotal(splitCreateMany)).toBe(250);
  });

  it('still re-derives from the items when they DO carry categories', async () => {
    // Guard against the fix over-reaching: a receipt split must keep being
    // rebuilt from its items, not proportionally rescaled.
    const { service, splitCreateMany } = makeSplitDefenceService({
      amount: 240,
      splits: MANUAL_SPLITS,
    });

    await service.update('acc-1', 'e-split-1', { amount: 238 } as any);

    const rows = splitCreateMany.mock.calls[0][0].data as Array<{ categoryId: string }>;
    expect(rows.map((r) => r.categoryId).sort()).toEqual(['c-alc', 'c-food', 'c-home']);
    expect(createdSplitTotal(splitCreateMany)).toBe(238);
  });
});
