import { SubscriptionRenewalCron, addCycle } from './subscription-renewal.cron';

// ─── addCycle pure-function tests ────────────────────────────────────────────

describe('addCycle', () => {
  it('weekly: adds 7 days', () => {
    const result = addCycle(new Date('2026-06-01'), 'weekly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-08');
  });

  it('monthly: standard date advances one month', () => {
    const result = addCycle(new Date('2026-06-15'), 'monthly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('monthly: Jan 31 → Feb 28 (clamps to end of month)', () => {
    const result = addCycle(new Date('2026-01-31'), 'monthly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('monthly: Jan 31 → Feb 29 in a leap year', () => {
    const result = addCycle(new Date('2028-01-31'), 'monthly');
    expect(result.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('quarterly: Mar 31 → Jun 30 (clamps to end of June)', () => {
    const result = addCycle(new Date('2026-03-31'), 'quarterly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('quarterly: standard date advances 3 months', () => {
    const result = addCycle(new Date('2026-01-15'), 'quarterly');
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('yearly: same day next year', () => {
    const result = addCycle(new Date('2026-06-01'), 'yearly');
    expect(result.toISOString().slice(0, 10)).toBe('2027-06-01');
  });

  it('yearly: Feb 29 leap → Feb 28 non-leap', () => {
    const result = addCycle(new Date('2024-02-29'), 'yearly');
    expect(result.toISOString().slice(0, 10)).toBe('2025-02-28');
  });

  it('does not mutate the input date', () => {
    const original = new Date('2026-06-01');
    addCycle(original, 'monthly');
    expect(original.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});

// ─── SubscriptionRenewalCron.handleDueRenewals tests ────────────────────────

function makeCron(overrides: {
  findManySubscriptions?: jest.Mock;
  findFirstMember?: jest.Mock;
  transaction?: jest.Mock;
  sendToUser?: jest.Mock;
} = {}) {
  const prisma: any = {
    userSubscription: {
      findMany: overrides.findManySubscriptions ?? jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    accountMember: {
      findFirst: overrides.findFirstMember ?? jest.fn().mockResolvedValue({ userId: 'user-owner' }),
    },
    expense: { create: jest.fn().mockResolvedValue({ id: 'exp-new' }) },
    $transaction: overrides.transaction ?? jest.fn().mockResolvedValue([]),
  };
  const notifications: any = {
    sendToUser: overrides.sendToUser ?? jest.fn().mockResolvedValue(undefined),
  };
  const cron = new SubscriptionRenewalCron(prisma, notifications);
  return { cron, prisma, notifications };
}

function makeDueSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    accountId: 'acc-1',
    name: 'Netflix',
    amount: 15.99,
    currencyCode: 'USD',
    billingCycle: 'monthly',
    nextRenewalDate: new Date('2026-06-01'), // clearly <= today
    categoryId: null,
    isActive: true,
    ...overrides,
  };
}

describe('handleDueRenewals', () => {
  it('logs "no renewals" and returns when nothing is due', async () => {
    const { cron, prisma } = makeCron({
      findManySubscriptions: jest.fn().mockResolvedValue([]),
    });

    await cron.handleDueRenewals();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an expense and advances nextRenewalDate for a due subscription', async () => {
    const sub = makeDueSub();
    const { cron, prisma } = makeCron({
      findManySubscriptions: jest.fn().mockResolvedValue([sub]),
      findFirstMember: jest.fn().mockResolvedValue({ userId: 'user-owner' }),
      transaction: jest.fn().mockResolvedValue([]),
    });

    await cron.handleDueRenewals();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as any[];
    // The ops array should contain 2 promises (create expense + update subscription).
    expect(ops).toHaveLength(2);
  });

  it('skips subscription when account has no members', async () => {
    const sub = makeDueSub();
    const { cron, prisma } = makeCron({
      findManySubscriptions: jest.fn().mockResolvedValue([sub]),
      findFirstMember: jest.fn().mockResolvedValue(null),
    });

    await cron.handleDueRenewals();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('logs error and continues to next subscription when $transaction throws', async () => {
    const sub1 = makeDueSub({ id: 'sub-1' });
    const sub2 = makeDueSub({ id: 'sub-2' });

    let callCount = 0;
    const transaction = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('DB error');
      return [];
    });

    const { cron, prisma } = makeCron({
      findManySubscriptions: jest.fn().mockResolvedValue([sub1, sub2]),
      findFirstMember: jest.fn().mockResolvedValue({ userId: 'user-owner' }),
      transaction,
    });

    // Must not throw — cron should absorb per-subscription errors.
    await expect(cron.handleDueRenewals()).resolves.toBeUndefined();
    // Second subscription still gets processed.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('uses fallback member when no owner role exists', async () => {
    const sub = makeDueSub();
    let callCount = 0;
    const findFirstMember = jest.fn().mockImplementation(async () => {
      callCount++;
      // First call (owner lookup) returns null; second call (fallback) returns a member.
      return callCount === 1 ? null : { userId: 'user-fallback' };
    });
    const { cron, prisma } = makeCron({
      findManySubscriptions: jest.fn().mockResolvedValue([sub]),
      findFirstMember,
      transaction: jest.fn().mockResolvedValue([]),
    });

    await cron.handleDueRenewals();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
