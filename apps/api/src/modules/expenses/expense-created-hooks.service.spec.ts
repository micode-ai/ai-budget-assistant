import { ExpenseCreatedHooksService } from './expense-created-hooks.service';

// ---------------------------------------------------------------------------
// reconcileNotificationStub (Tier 1 Case A)
// ---------------------------------------------------------------------------

function makeReconcileHooksService(overrides: {
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
  };
  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const anomalyService: any = {
    checkExpense: jest.fn().mockResolvedValue(undefined),
    dismissForExpense: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ExpenseCreatedHooksService(prisma, anomalyService, cacheService);
  return { service, prisma, cacheService, anomalyService, stubUpdateMock };
}

describe('reconcileNotificationStub (Tier 1 Case A)', () => {
  it('soft-deletes a matching notification stub when a richer (manual) expense is created', async () => {
    const { service, prisma, stubUpdateMock } = makeReconcileHooksService();
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
    const { service, stubUpdateMock } = makeReconcileHooksService({ stubs: [] });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does nothing when the new expense has no merchant or description', async () => {
    const { service, stubUpdateMock } = makeReconcileHooksService({
      newExpense: { id: 'e-new', amount: 15, currencyCode: 'PLN', date: new Date('2026-06-15'), merchant: null, description: null },
    });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does nothing when no stub payee matches', async () => {
    const { service, stubUpdateMock } = makeReconcileHooksService({
      stubs: [{ id: 'stub-1', merchant: 'Biedronka', description: 'Biedronka' }],
    });
    await (service as any).reconcileNotificationStub('acc-1', 'e-new');
    expect(stubUpdateMock).not.toHaveBeenCalled();
  });

  it('does not call reconcileNotificationStub via onExpenseCreated when the new expense source is notification', async () => {
    // The guard now lives inside onExpenseCreated itself — exercise the real
    // method rather than replicating the condition in the test.
    const { service } = makeReconcileHooksService();
    const reconcileSpy = jest.spyOn(service as any, 'reconcileNotificationStub');

    await service.onExpenseCreated(
      'acc-1',
      'u1',
      { id: 'e-new', amount: 15, currencyCode: 'PLN', source: 'notification' },
      [],
    );
    // fire-and-forget — allow the microtask to run
    await new Promise((r) => setImmediate(r));

    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onExpenseCreated — the post-create hook chain itself
// ---------------------------------------------------------------------------

function makeHooksService(overrides: {
  familyFeed?: any;
  communityPrices?: any;
  shieldTracking?: any;
  productRules?: any;
  stubLookupResult?: any;
} = {}) {
  const prisma: any = {
    expense: {
      // No matching row -> reconcileNotificationStub returns early without
      // needing findMany/update mocks. Override via stubLookupResult when a
      // test needs the stub-reconciliation path itself (covered above).
      findFirst: jest.fn().mockResolvedValue(overrides.stubLookupResult ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const cacheService: any = {
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const anomalyService: any = {
    checkExpense: jest.fn().mockResolvedValue(undefined),
    dismissForExpense: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ExpenseCreatedHooksService(
    prisma,
    anomalyService,
    cacheService,
    overrides.familyFeed,
    overrides.communityPrices,
    overrides.shieldTracking,
    overrides.productRules,
  );

  return { service, prisma, cacheService, anomalyService };
}

describe('onExpenseCreated', () => {
  const baseExpense = { id: 'e-1', amount: 15, currencyCode: 'PLN', source: 'manual' };

  it('fires anomalyService.checkExpense for a new expense', async () => {
    const { service, anomalyService } = makeHooksService();

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(anomalyService.checkExpense).toHaveBeenCalledWith('a1', 'u1', 'e-1');
  });

  it('records a family-feed event with the expense amount and currency', async () => {
    const familyFeed: any = { recordEvent: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeHooksService({ familyFeed });

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(familyFeed.recordEvent).toHaveBeenCalledWith('a1', 'u1', 'EXPENSE_ADDED', 'e-1', {
      amount: 15,
      currency: 'PLN',
    });
  });

  it('never throws when familyFeed is not injected (optional dependency)', async () => {
    const { service } = makeHooksService();
    await expect(service.onExpenseCreated('a1', 'u1', baseExpense, [])).resolves.toBeUndefined();
  });

  it('contributes to the community price corpus', async () => {
    const communityPrices: any = { recordContribution: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeHooksService({ communityPrices });

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(communityPrices.recordContribution).toHaveBeenCalledWith('a1', 'u1', 'e-1');
  });

  it('fires inflation-shield reconcilePurchase after a new expense', async () => {
    const shieldTracking: any = { reconcilePurchase: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeHooksService({ shieldTracking });

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(shieldTracking.reconcilePurchase).toHaveBeenCalledWith('a1', 'e-1');
  });

  it('invalidates the shield cache for the account', async () => {
    const { service, cacheService } = makeHooksService();

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(cacheService.delByPrefix).toHaveBeenCalledWith('shield:a1:');
  });

  it('teaches a product rule for every learnable item', async () => {
    const productRules: any = { upsertRules: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeHooksService({ productRules });

    await service.onExpenseCreated('a1', 'u1', baseExpense, [
      { canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' },
    ]);
    await new Promise((r) => setImmediate(r));

    expect(productRules.upsertRules).toHaveBeenCalledWith('a1', [
      { canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' },
    ]);
  });

  it('does not call productRules.upsertRules when there are no learnable items', async () => {
    const productRules: any = { upsertRules: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeHooksService({ productRules });

    await service.onExpenseCreated('a1', 'u1', baseExpense, []);
    await new Promise((r) => setImmediate(r));

    expect(productRules.upsertRules).not.toHaveBeenCalled();
  });

  it('never rejects even when productRules.upsertRules rejects', async () => {
    const productRules: any = { upsertRules: jest.fn().mockRejectedValue(new Error('boom')) };
    const { service } = makeHooksService({ productRules });

    let unhandled: unknown;
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason;
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await expect(
        service.onExpenseCreated('a1', 'u1', baseExpense, [{ canonicalName: 'Piwo Żywiec', categoryId: 'c-alc' }]),
      ).resolves.toBeUndefined();

      expect(productRules.upsertRules).toHaveBeenCalled();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toBeUndefined();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('never rejects even when every optional dependency rejects', async () => {
    const familyFeed: any = { recordEvent: jest.fn().mockRejectedValue(new Error('feed down')) };
    const communityPrices: any = { recordContribution: jest.fn().mockRejectedValue(new Error('cp down')) };
    const shieldTracking: any = { reconcilePurchase: jest.fn().mockRejectedValue(new Error('shield down')) };
    const productRules: any = { upsertRules: jest.fn().mockRejectedValue(new Error('rules down')) };
    const { service, anomalyService } = makeHooksService({
      familyFeed,
      communityPrices,
      shieldTracking,
      productRules,
    });
    anomalyService.checkExpense.mockRejectedValue(new Error('anomaly down'));

    await expect(
      service.onExpenseCreated('a1', 'u1', baseExpense, [{ canonicalName: 'x', categoryId: 'c-1' }]),
    ).resolves.toBeUndefined();
    // Give every fire-and-forget branch a chance to settle (and swallow its error).
    await new Promise((r) => setImmediate(r));
  });
});
