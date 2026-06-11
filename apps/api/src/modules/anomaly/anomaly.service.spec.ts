import { AnomalyService, detectCycle, normalizeMerchant, monthKey } from './anomaly.service';

function makeService(overrides: {
  alertCreate?: jest.Mock;
  alertCount?: jest.Mock;
  sendToUser?: jest.Mock;
} = {}) {
  const prisma: any = {
    anomalyAlert: {
      create: overrides.alertCreate ?? jest.fn().mockResolvedValue({ id: 'alert-1' }),
      count: overrides.alertCount ?? jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    expense: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn() },
    userSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findFirst: jest.fn().mockResolvedValue({ name: 'Food' }) },
  };
  const notifications: any = {
    sendToUser: overrides.sendToUser ?? jest.fn().mockResolvedValue(true),
  };
  const service = new AnomalyService(prisma, notifications);
  return { service, prisma, notifications };
}

describe('pure helpers', () => {
  it('normalizeMerchant trims and lowercases', () => {
    expect(normalizeMerchant('  Netflix ')).toBe('netflix');
  });

  it('monthKey formats UTC year-month', () => {
    expect(monthKey(new Date(Date.UTC(2026, 5, 10)))).toBe('2026-06');
  });

  it('detectCycle: 3 charges ~30 days apart → monthly', () => {
    expect(detectCycle([new Date('2026-04-01'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe('monthly');
  });

  it('detectCycle: 3 charges 7 days apart → weekly', () => {
    expect(detectCycle([new Date('2026-05-17'), new Date('2026-05-24'), new Date('2026-05-31')])).toBe('weekly');
  });

  it('detectCycle: gap of 24 days → null (below monthly window)', () => {
    expect(detectCycle([new Date('2026-04-07'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: gap of 36 days → null (above monthly window)', () => {
    expect(detectCycle([new Date('2026-03-26'), new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });

  it('detectCycle: fewer than 3 dates → null', () => {
    expect(detectCycle([new Date('2026-05-01'), new Date('2026-05-31')])).toBe(null);
  });
});

describe('createAlert', () => {
  const input = {
    accountId: 'acc-1',
    userId: 'user-1',
    type: 'duplicate_charge' as const,
    dedupKey: 'dup:e-1',
    params: { merchant: 'Netflix' },
    expenseId: 'e-1',
    pushTitle: () => 'title',
    pushBody: () => 'body',
  };

  it('creates the row and sends push when under the daily cap', async () => {
    const { service, prisma, notifications } = makeService();
    await service.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).toHaveBeenCalledTimes(1);
    expect(prisma.anomalyAlert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { pushSent: true },
    });
  });

  it('silently skips on dedupKey collision (P2002)', async () => {
    const err: any = new Error('unique');
    err.code = 'P2002';
    const { service, notifications } = makeService({ alertCreate: jest.fn().mockRejectedValue(err) });
    await expect(service.createAlert(input)).resolves.toBeUndefined();
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('creates the feed row but skips push when the daily cap is reached', async () => {
    const { service, prisma, notifications } = makeService({ alertCount: jest.fn().mockResolvedValue(3) });
    await service.createAlert(input);
    expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('does not stamp pushSent when the push fails', async () => {
    const { service, prisma } = makeService({ sendToUser: jest.fn().mockResolvedValue(false) });
    await service.createAlert(input);
    expect(prisma.anomalyAlert.update).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 errors so fire-and-forget callers can log them', async () => {
    const { service } = makeService({ alertCreate: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(service.createAlert(input)).rejects.toThrow('boom');
  });
});

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
  it('alerts when another same-merchant same-amount expense exists within ±1 day', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue({ id: 'e-old' });
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('duplicate_charge');
    expect(arg.dedupKey).toBe('dup:e-new');
    expect(arg.expenseId).toBe('e-new');
    const where = (prisma.expense.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 'e-new' });
    expect(where.merchant).toEqual({ equals: 'Netflix', mode: 'insensitive' });
  });

  it('does nothing without a merchant', async () => {
    const { service } = makeService();
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ merchant: null }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no candidate is found', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue(null);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('excludes rows from the same import batch', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue(null);
    jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectDuplicateCharge('acc-1', 'user-1', expenseRow({ importBatchId: 'batch-1' }) as any);
    const where = (prisma.expense.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.NOT).toEqual({ importBatchId: 'batch-1' });
  });
});

describe('detectPriceIncrease', () => {
  it('alerts when expense exceeds a tracked subscription amount by >10%', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 29 },
    ]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 43 }) as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('price_increase');
    expect(arg.dedupKey).toBe('price:netflix:2026-06');
    expect(arg.params).toMatchObject({ oldAmount: '29.00', newAmount: '43.00', percent: 48 });
  });

  it('does NOT alert at exactly +10%', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([
      { id: 'sub-1', name: 'netflix', amount: 100 },
    ]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow({ amount: 110 }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('falls back to the recurringId series when no subscription matches', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findFirst = jest.fn().mockResolvedValue({ amount: 30 });
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectPriceIncrease(
      'acc-1',
      'user-1',
      expenseRow({ amount: 40, merchant: null, description: 'Gym', recurringId: 'rec-9' }) as any,
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0].dedupKey).toBe('price:rec-9:2026-06');
  });

  it('does nothing when neither subscription nor series matches', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectPriceIncrease('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('detectRecurringSuggestion', () => {
  const monthlyDates = [
    { date: new Date('2026-04-10') },
    { date: new Date('2026-05-10') },
    { date: new Date('2026-06-10') },
  ];

  it('alerts on the 3rd same-amount monthly charge of an untracked merchant', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);

    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('recurring_suggestion');
    expect(arg.dedupKey).toBe('recur:netflix');
    expect(arg.params).toMatchObject({ merchant: 'Netflix', cycle: 'monthly' });
  });

  it('skips when a tracked subscription already matches the merchant', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([{ name: 'NETFLIX' }]);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('skips expenses that are already part of a recurring series', async () => {
    const { service } = makeService();
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow({ recurringId: 'rec-1' }) as any);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('skips with fewer than 3 charges', async () => {
    const { service, prisma } = makeService();
    prisma.userSubscription.findMany = jest.fn().mockResolvedValue([]);
    prisma.expense.findMany = jest.fn().mockResolvedValue(monthlyDates.slice(1));
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    await service.detectRecurringSuggestion('acc-1', 'user-1', expenseRow() as any);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('checkExpenseBatch', () => {
  it('skips the duplicate detector and dedups category checks', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      expenseRow({ id: 'e-1', categoryId: 'cat-1' }),
      expenseRow({ id: 'e-2', categoryId: 'cat-1' }),
    ]);
    const dup = jest.spyOn(service, 'detectDuplicateCharge').mockResolvedValue(undefined);
    const price = jest.spyOn(service, 'detectPriceIncrease').mockResolvedValue(undefined);
    const recur = jest.spyOn(service, 'detectRecurringSuggestion').mockResolvedValue(undefined);
    const spike = jest.spyOn(service, 'detectCategorySpike').mockResolvedValue(undefined);

    await service.checkExpenseBatch('acc-1', 'user-1', ['e-1', 'e-2']);

    expect(dup).not.toHaveBeenCalled();
    expect(price).toHaveBeenCalledTimes(2);
    expect(recur).toHaveBeenCalledTimes(2);
    expect(spike).toHaveBeenCalledTimes(1); // same category checked once
  });
});

describe('detectCategorySpike', () => {
  function spikeService(currentSum: number, prevRows: Array<{ amount: number; date: Date }>) {
    const { service, prisma } = makeService();
    prisma.expense.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: currentSum } });
    prisma.expense.findMany = jest.fn().mockResolvedValue(prevRows);
    const createSpy = jest.spyOn(service, 'createAlert').mockResolvedValue(undefined);
    return { service, prisma, createSpy };
  }

  // two previous months, 100 each → avg 100
  const twoMonths = [
    { amount: 100, date: new Date('2026-04-15') },
    { amount: 100, date: new Date('2026-05-15') },
  ];

  it('alerts when current month is ≥30% above the previous average (no budget required)', async () => {
    const { service, createSpy } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.type).toBe('category_spike');
    expect(arg.dedupKey).toMatch(/^spike:cat-1:\d{4}-\d{2}$/);
    expect(arg.params).toMatchObject({ categoryName: 'Food', percent: 50 });
  });

  it('does not alert below the 30% threshold', async () => {
    const { service, createSpy } = spikeService(129, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('requires at least 2 months of history', async () => {
    const { service, createSpy } = spikeService(150, [{ amount: 100, date: new Date('2026-05-15') }]);
    await service.detectCategorySpike('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('no-ops on null categoryId', async () => {
    const { service, createSpy } = spikeService(150, twoMonths);
    await service.detectCategorySpike('acc-1', 'user-1', null, 'PLN');
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('checkExpense', () => {
  it('never throws even when a detector rejects (fire-and-forget safety)', async () => {
    const { service, prisma } = makeService();
    prisma.expense.findFirst = jest.fn().mockResolvedValue(expenseRow());
    jest.spyOn(service, 'detectDuplicateCharge').mockRejectedValue(new Error('detector boom'));
    await expect(service.checkExpense('acc-1', 'user-1', 'e-new')).resolves.toBeUndefined();
  });
});
