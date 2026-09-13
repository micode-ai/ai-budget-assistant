import { AnomalyService } from './anomaly.service';
import { AnomalyDetectorsService } from './anomaly-detectors.service';

function makeService(overrides: { expenseFindFirst?: jest.Mock } = {}) {
  const prisma: any = {
    expense: {
      findFirst: overrides.expenseFindFirst ?? jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    anomalyAlert: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const detectors = {
    detectDuplicateCharge: jest.fn().mockResolvedValue(undefined),
    detectPriceIncrease: jest.fn().mockResolvedValue(undefined),
    detectRecurringSuggestion: jest.fn().mockResolvedValue(undefined),
    detectCategorySpike: jest.fn().mockResolvedValue(undefined),
    detectPossibleMerge: jest.fn().mockResolvedValue(undefined),
    detectPriceOvercharge: jest.fn().mockResolvedValue(undefined),
  } as unknown as AnomalyDetectorsService;
  const service = new AnomalyService(prisma, detectors);
  return { service, prisma, detectors: detectors as any };
}

function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-new',
    accountId: 'acc-1',
    merchant: 'Netflix',
    amount: 43,
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

describe('checkExpense', () => {
  it('does nothing when the expense is not found', async () => {
    const { service, detectors } = makeService();
    await service.checkExpense('acc-1', 'user-1', 'missing');
    expect(detectors.detectDuplicateCharge).not.toHaveBeenCalled();
  });

  it('fans out to every detector for a found expense', async () => {
    const { service, detectors } = makeService({ expenseFindFirst: jest.fn().mockResolvedValue(expenseRow()) });
    await service.checkExpense('acc-1', 'user-1', 'e-new');
    expect(detectors.detectDuplicateCharge).toHaveBeenCalledTimes(1);
    expect(detectors.detectPriceIncrease).toHaveBeenCalledTimes(1);
    expect(detectors.detectRecurringSuggestion).toHaveBeenCalledTimes(1);
    expect(detectors.detectCategorySpike).toHaveBeenCalledWith('acc-1', 'user-1', 'cat-1', 'PLN');
    expect(detectors.detectPossibleMerge).toHaveBeenCalledTimes(1);
    expect(detectors.detectPriceOvercharge).toHaveBeenCalledTimes(1);
  });

  it('calls detectPossibleMerge AFTER detectDuplicateCharge', async () => {
    const { service, detectors } = makeService({ expenseFindFirst: jest.fn().mockResolvedValue(expenseRow()) });
    const callOrder: string[] = [];
    detectors.detectDuplicateCharge.mockImplementation(async () => { callOrder.push('dup'); });
    detectors.detectPossibleMerge.mockImplementation(async () => { callOrder.push('merge'); });
    await service.checkExpense('acc-1', 'user-1', 'e-new');
    expect(callOrder.indexOf('merge')).toBeGreaterThan(callOrder.indexOf('dup'));
  });

  it('never throws even when a detector rejects (fire-and-forget safety)', async () => {
    const { service, detectors } = makeService({ expenseFindFirst: jest.fn().mockResolvedValue(expenseRow()) });
    detectors.detectDuplicateCharge.mockRejectedValue(new Error('detector boom'));
    await expect(service.checkExpense('acc-1', 'user-1', 'e-new')).resolves.toBeUndefined();
  });
});

describe('checkExpenseBatch', () => {
  it('skips the duplicate detector and dedups category checks', async () => {
    const { service, prisma, detectors } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([
      expenseRow({ id: 'e-1', categoryId: 'cat-1' }),
      expenseRow({ id: 'e-2', categoryId: 'cat-1' }),
    ]);

    await service.checkExpenseBatch('acc-1', 'user-1', ['e-1', 'e-2']);

    expect(detectors.detectDuplicateCharge).not.toHaveBeenCalled();
    expect(detectors.detectPriceIncrease).toHaveBeenCalledTimes(2);
    expect(detectors.detectRecurringSuggestion).toHaveBeenCalledTimes(2);
    expect(detectors.detectCategorySpike).toHaveBeenCalledTimes(1); // same category checked once
  });

  it('no-ops on an empty id list', async () => {
    const { service, prisma, detectors } = makeService();
    await service.checkExpenseBatch('acc-1', 'user-1', []);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(detectors.detectPriceIncrease).not.toHaveBeenCalled();
  });

  it('never throws even when a detector rejects', async () => {
    const { service, prisma, detectors } = makeService();
    prisma.expense.findMany = jest.fn().mockResolvedValue([expenseRow()]);
    detectors.detectPriceIncrease.mockRejectedValue(new Error('boom'));
    await expect(service.checkExpenseBatch('acc-1', 'user-1', ['e-new'])).resolves.toBeUndefined();
  });
});

describe('findAll', () => {
  it('applies the unreadOnly filter and returns the unread count', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([{ id: 'a-1' }]);
    prisma.anomalyAlert.count = jest.fn().mockResolvedValue(2);

    const result = await service.findAll('acc-1', true);

    expect(result).toEqual({ alerts: [{ id: 'a-1' }], unreadCount: 2 });
    const where = (prisma.anomalyAlert.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.readAt).toBeNull();
  });
});

describe('getPriceCheckSummary', () => {
  it('sums per currency and never blends them', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 4 }, { overpaidAmount: 2.5 }] } },
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 1.5 }] } },
      { params: { currencyCode: 'EUR', findings: [{ overpaidAmount: 3 }] } },
    ]);

    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));

    expect(out.totalsByCurrency).toEqual({ PLN: 8, EUR: 3 });
    expect(out.alertCount).toBe(3);
  });

  it('returns empty totals when there are no alerts', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([]);
    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));
    expect(out.totalsByCurrency).toEqual({});
    expect(out.alertCount).toBe(0);
  });

  it('ignores a malformed params blob instead of throwing', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.findMany = jest.fn().mockResolvedValue([
      { params: null },
      { params: { currencyCode: 'PLN', findings: 'not-an-array' } },
      // A number is not iterable — `for...of` over it throws `is not iterable`.
      // A string ('not-an-array' above) is iterable, so it can't by itself prove
      // the Array.isArray guard is load-bearing; this row can.
      { params: { currencyCode: 'PLN', findings: 42 } },
      { params: { currencyCode: 'PLN', findings: [{ overpaidAmount: 'x' }, { overpaidAmount: 5 }] } },
    ]);
    const out = await service.getPriceCheckSummary('acc-1', new Date('2026-01-01'));
    expect(out.totalsByCurrency).toEqual({ PLN: 5 });
  });
});

describe('markRead / markAllRead / dismiss', () => {
  it('markRead scopes by id + accountId + unread', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const result = await service.markRead('acc-1', 'a-1');
    expect(result).toEqual({ success: true, updated: 1 });
    const where = (prisma.anomalyAlert.updateMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ id: 'a-1', accountId: 'acc-1', readAt: null });
  });

  it('markAllRead scopes by accountId + unread', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const result = await service.markAllRead('acc-1');
    expect(result).toEqual({ success: true, updated: 3 });
  });

  it('dismiss scopes by id + accountId only', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const result = await service.dismiss('acc-1', 'a-1');
    expect(result).toEqual({ success: true, updated: 1 });
    const where = (prisma.anomalyAlert.updateMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ id: 'a-1', accountId: 'acc-1' });
  });
});

describe('dismissForExpense', () => {
  it('dismisses active alerts that reference the deleted expense on either side of the pair', async () => {
    const { service, prisma } = makeService();
    await service.dismissForExpense('acc-1', 'e-1');
    expect(prisma.anomalyAlert.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.anomalyAlert.updateMany.mock.calls[0][0];
    expect(arg.where.accountId).toBe('acc-1');
    expect(arg.where.dismissedAt).toBeNull();
    expect(arg.where.OR).toEqual([
      { expenseId: 'e-1' },
      { params: { path: ['otherExpenseId'], equals: 'e-1' } },
    ]);
    expect(arg.data.dismissedAt).toBeInstanceOf(Date);
  });

  it('no-ops on an empty expense id', async () => {
    const { service, prisma } = makeService();
    await service.dismissForExpense('acc-1', '');
    expect(prisma.anomalyAlert.updateMany).not.toHaveBeenCalled();
  });

  it('never throws when the update fails (fire-and-forget)', async () => {
    const { service, prisma } = makeService();
    prisma.anomalyAlert.updateMany = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(service.dismissForExpense('acc-1', 'e-1')).resolves.toBeUndefined();
  });
});
