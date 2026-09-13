import { AnomalyDetectorsService } from './anomaly-detectors.service';
import { AnomalyAlertWriterService } from './anomaly-alert-writer.service';

function makeService(overrides: { configGet?: jest.Mock } = {}) {
  const prisma: any = {
    expense: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn() },
    userSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findFirst: jest.fn().mockResolvedValue({ name: 'Food' }) },
    expenseItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const priceHistory: any = {
    getProductTrendsFor: jest.fn().mockResolvedValue([]),
  };
  const config: any = {
    get: overrides.configGet ?? jest.fn().mockReturnValue(undefined),
  };
  const alertWriter = { createAlert: jest.fn().mockResolvedValue(undefined) } as unknown as AnomalyAlertWriterService;
  const service = new AnomalyDetectorsService(prisma, priceHistory, config, alertWriter);
  return { service, prisma, priceHistory, config, alertWriter: alertWriter as any };
}

function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-new',
    accountId: 'acc-1',
    merchant: 'Netflix',
    amount: 43, // Prisma Decimal arrives as Decimal; the service always wraps with Number()
    currencyCode: 'PLN',
    date: new Date('2026-06-10'),
    description: 'Netflix',
    recurringId: null,
    isRecurring: false,
    categoryId: 'cat-1',
    importBatchId: null,
    ...overrides,
  };
}

describe('detectDuplicateCharge', () => {
  it('alerts when another same-payee same-amount expense exists within ±1 day', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([{ id: 'e-old', merchant: 'Netflix', description: 'Netflix' }]);

    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('duplicate_charge');
    expect(arg.dedupKey).toBe('dup:e-new');
    expect(arg.expenseId).toBe('e-new');
    const where = (prisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'e-new' });
    expect(where.currencyCode).toBe('PLN');
  });

  it('matches by description when the expense has no merchant', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([{ id: 'e-old', merchant: null, description: 'Coffee' }]);

    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ merchant: null, description: 'Coffee' }) as any);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    expect(alertWriter.createAlert.mock.calls[0][0].params.merchant).toBe('Coffee');
  });

  it('does nothing when both merchant and description are empty', async () => {
    const { service, alertWriter } = makeService();
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ merchant: null, description: null }) as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('does nothing when no candidate matches the payee label', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([{ id: 'e-old', merchant: 'Spotify', description: 'Spotify' }]);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any); // label "Netflix"
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('excludes rows from the same import batch', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([]);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ importBatchId: 'batch-1' }) as any);
    const where = (prisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.NOT).toEqual({ importBatchId: 'batch-1' });
  });
});

describe('detectPriceIncrease', () => {
  it('alerts when expense exceeds a tracked subscription amount by >10%', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 29 },
    ]);

    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 43 }) as any);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('price_increase');
    expect(arg.dedupKey).toBe('price:netflix:2026-06');
    expect(arg.params).toMatchObject({ oldAmount: '29.00', newAmount: '43.00', percent: 48 });
  });

  it('does NOT alert at exactly +10%', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 100 },
    ]);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 110 }) as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('falls back to the recurringId series when no subscription matches', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findFirst = jest.fn().mockResolvedValue({ amount: 30 });

    await service.detectPriceIncrease(
      'acc-1',
      'user-1',
      expenseRow({ amount: 40, merchant: null, description: 'Gym', recurringId: 'rec-9' }) as any,
    );

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    expect(alertWriter.createAlert.mock.calls[0][0].dedupKey).toBe('price:rec-9:2026-06');
  });

  it('does nothing when neither subscription nor series matches', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow() as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });
});

describe('detectRecurringSuggestion', () => {
  const monthlyDates = [
    { date: new Date('2026-04-10') },
    { date: new Date('2026-05-10') },
    { date: new Date('2026-06-10') },
  ];

  it('alerts on the 3rd same-amount monthly charge of an untracked merchant', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates);

    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('recurring_suggestion');
    expect(arg.dedupKey).toBe('recur:netflix');
    expect(arg.params).toMatchObject({ merchant: 'Netflix', cycle: 'monthly' });
  });

  it('skips when a tracked subscription already matches the merchant', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([{ name: 'NETFLIX' }]);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('skips expenses that are already part of a recurring series', async () => {
    const { service, alertWriter } = makeService();
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow({ recurringId: 'rec-1' }) as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('skips with fewer than 3 charges', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates.slice(1));
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });
});

describe('detectCategorySpike', () => {
  function spikeService(currentSum: number, prevRows: Array<{ amount: number; date: Date }>) {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: currentSum } });
    prisma.expense.findMany = jest.fn().mockResolvedValue(prevRows);
    return { service, prisma, alertWriter };
  }

  // two previous months, 100 each → avg 100
  const twoMonths = [
    { amount: 100, date: new Date('2026-04-15') },
    { amount: 100, date: new Date('2026-05-15') },
  ];

  it('alerts when current month is ≥30% above the previous average (no budget required)', async () => {
    const { service, alertWriter } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('category_spike');
    expect(arg.dedupKey).toMatch(/^spike:cat-1:\d{4}-\d{2}$/);
    expect(arg.params).toMatchObject({ categoryName: 'Food', percent: 50 });
  });

  it('does not alert below the 30% threshold', async () => {
    const { service, alertWriter } = spikeService(129, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('requires at least 2 months of history', async () => {
    const { service, alertWriter } = spikeService(150, [{ amount: 100, date: new Date('2026-05-15') }]);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('no-ops on null categoryId', async () => {
    const { service, alertWriter } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', null, 'PLN');
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });
});

describe('detectPossibleMerge', () => {
  const baseExpense = expenseRow({ currencyCode: 'EUR', id: 'e-eur' });

  it('creates a possible_merge alert when same payee + date ±1d + DIFFERENT currency', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      { id: 'e-pln', merchant: 'Netflix', description: 'Netflix', currencyCode: 'PLN', amount: 43 },
    ]);
    await service.detectPossibleMerge('acc-1', 'user-1', baseExpense as any);
    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('possible_merge');
    expect(arg.params).toMatchObject({
      expenseId: 'e-eur',
      otherExpenseId: 'e-pln',
      currencyA: 'EUR',
      currencyB: 'PLN',
    });
  });

  it('does NOT fire when same currency (that is detectDuplicateCharge territory)', async () => {
    const { service, prisma, alertWriter } = makeService();
    // The query filters out same currency via currencyCode:{not:...}, so findMany returns []
    prisma.expense.findMany = jest.fn().mockResolvedValue([]);
    await service.detectPossibleMerge('acc-1', 'user-1', baseExpense as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
    // Confirm the query asked for a different currency
    const where = (prisma.expense.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.currencyCode).toEqual({ not: 'EUR' });
  });

  it('does NOT fire when empty payee', async () => {
    const { service, alertWriter } = makeService();
    await service.detectPossibleMerge('acc-1', 'user-1', expenseRow({ merchant: null, description: null }) as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('does NOT fire when the payees differ', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      { id: 'e-pln', merchant: 'Spotify', description: 'Spotify', currencyCode: 'PLN', amount: 20 },
    ]);
    await service.detectPossibleMerge('acc-1', 'user-1', baseExpense as any);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('dedupKey is order-independent — sorted ids produce the same key', async () => {
    const { service, prisma, alertWriter } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      { id: 'e-pln', merchant: 'Netflix', description: 'Netflix', currencyCode: 'PLN', amount: 43 },
    ]);

    await service.detectPossibleMerge('acc-1', 'user-1', baseExpense as any);
    const key1 = alertWriter.createAlert.mock.calls[0][0].dedupKey;

    // Now swap roles: e-pln is the new expense, e-eur is the candidate.
    const expensePln = expenseRow({ id: 'e-pln', currencyCode: 'PLN', merchant: 'Netflix', description: 'Netflix' });
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      { id: 'e-eur', merchant: 'Netflix', description: 'Netflix', currencyCode: 'EUR', amount: 10 },
    ]);
    await service.detectPossibleMerge('acc-1', 'user-1', expensePln as any);
    const key2 = alertWriter.createAlert.mock.calls[1][0].dedupKey;

    expect(key1).toBe(key2);
    expect(key1).toBe('merge:e-eur:e-pln'); // sorted
  });
});

describe('detectPriceOvercharge', () => {
  const expense = {
    id: 'exp-1',
    merchant: 'Biedronka',
    description: null,
    amount: 100,
    currencyCode: 'PLN',
    date: new Date('2026-07-25'),
    recurringId: null,
    isRecurring: false,
    categoryId: null,
    importBatchId: null,
  };

  function withHistory(overrides: { configGet?: jest.Mock } = {}) {
    const ctx = makeService(overrides);
    ctx.priceHistory.getProductTrendsFor = jest.fn().mockResolvedValue([
      {
        canonicalName: 'Kawa',
        currency: 'PLN',
        points: [
          { date: '2026-07-01', price: 20 },
          { date: '2026-07-08', price: 20 },
        ],
      },
    ]);
    ctx.prisma.expenseItem = {
      findMany: jest.fn().mockResolvedValue([
        { canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 },
      ]),
    };
    return ctx;
  }

  it('creates one alert per receipt and never pushes, when the flag is on', async () => {
    const { service, alertWriter } = withHistory({ configGet: jest.fn().mockReturnValue('true') });

    await service.detectPriceOvercharge('acc-1', 'user-1', expense);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('price_overcharge');
    expect(arg.dedupKey).toBe('overcharge:exp-1');
    expect(arg.expenseId).toBe('exp-1');
    expect(arg.skipPush).toBe(true);
    expect((arg.params as any).findings).toHaveLength(1);
  });

  it('passes its own expense id as the history exclusion (Fix 1: must not count the receipt being checked as its own history)', async () => {
    const { service, priceHistory } = withHistory({ configGet: jest.fn().mockReturnValue('true') });

    await service.detectPriceOvercharge('acc-1', 'user-1', expense);

    expect(priceHistory.getProductTrendsFor).toHaveBeenCalledWith(
      'acc-1',
      ['Kawa'],
      'biedronka',
      expect.any(Date),
      'PLN',
      'exp-1',
    );
  });

  it('writes nothing when there are no findings', async () => {
    const { service, prisma, alertWriter } = withHistory();
    prisma.expenseItem.findMany = jest
      .fn()
      .mockResolvedValue([{ canonicalName: 'Kawa', quantity: 1, unitPrice: 20, totalPrice: 20 }]);
    await service.detectPriceOvercharge('acc-1', 'user-1', expense);
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('skips an expense with no line items', async () => {
    const { service, prisma, priceHistory, alertWriter } = makeService();
    prisma.expenseItem = { findMany: jest.fn().mockResolvedValue([]) };
    await service.detectPriceOvercharge('acc-1', 'user-1', expense);
    expect(priceHistory.getProductTrendsFor).not.toHaveBeenCalled();
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('is silent on a duplicate dedupKey', async () => {
    const { service, alertWriter } = withHistory({ configGet: jest.fn().mockReturnValue('true') });
    alertWriter.createAlert = jest.fn().mockRejectedValue({ code: 'P2002' });
    await expect(service.detectPriceOvercharge('acc-1', 'user-1', expense)).resolves.toBeUndefined();
  });

  it('is fail-silent: a thrown history query resolves without throwing and logs a warning (Fix 7)', async () => {
    const { service, priceHistory, alertWriter } = makeService();
    priceHistory.getProductTrendsFor = jest.fn().mockRejectedValue(new Error('db down'));
    (service as any).prisma.expenseItem = {
      findMany: jest.fn().mockResolvedValue([{ canonicalName: 'Kawa', quantity: 1, unitPrice: 30, totalPrice: 30 }]),
    };
    (service as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    await expect(service.detectPriceOvercharge('acc-1', 'user-1', expense)).resolves.toBeUndefined();
    expect((service as any).logger.warn).toHaveBeenCalled();
    expect(alertWriter.createAlert).not.toHaveBeenCalled();
  });

  it('when RECEIPT_CHECK_ALERTS_ENABLED is off, skips the alert write and logs the findings', async () => {
    const { service, alertWriter } = withHistory({ configGet: jest.fn().mockReturnValue(undefined) });
    (service as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };

    await service.detectPriceOvercharge('acc-1', 'user-1', expense);

    expect(alertWriter.createAlert).not.toHaveBeenCalled();
    expect((service as any).logger.log).toHaveBeenCalledWith(
      expect.stringContaining('1 line(s) above the usual price'),
    );
    expect((service as any).logger.log).toHaveBeenCalledWith(
      expect.stringContaining('alert write disabled'),
    );
  });

  it('when RECEIPT_CHECK_ALERTS_ENABLED=true, creates the alert', async () => {
    const { service, alertWriter } = withHistory({ configGet: jest.fn().mockReturnValue('true') });

    await service.detectPriceOvercharge('acc-1', 'user-1', expense);

    expect(alertWriter.createAlert).toHaveBeenCalledTimes(1);
    const arg = alertWriter.createAlert.mock.calls[0][0];
    expect(arg.type).toBe('price_overcharge');
    expect(arg.expenseId).toBe('exp-1');
  });

  it('when flag is off and there are no findings, logs nothing', async () => {
    const { service, prisma } = withHistory({ configGet: jest.fn().mockReturnValue(undefined) });
    (service as any).logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    prisma.expenseItem.findMany = jest
      .fn()
      .mockResolvedValue([{ canonicalName: 'Kawa', quantity: 1, unitPrice: 20, totalPrice: 20 }]);

    await service.detectPriceOvercharge('acc-1', 'user-1', expense);

    expect((service as any).logger.log).not.toHaveBeenCalled();
  });
});
