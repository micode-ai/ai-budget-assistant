import { AdminInvestorMetricsService } from './admin-investor-metrics.service';

function makePrisma() {
  return {
    user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    account: { count: jest.fn().mockResolvedValue(0) },
    expense: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    income: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    subscription: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    usageLog: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('AdminInvestorMetricsService', () => {
  const params = { months: 6, weeks: 12, activationDays: 3 };

  it('returns a cached response without querying prisma', async () => {
    const cached = { generatedAt: 'x', params } as any;
    const cache = { get: jest.fn().mockResolvedValue(cached), set: jest.fn() } as any;
    const prisma = makePrisma();
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res).toBe(cached);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('on cache miss, queries prisma, assembles all blocks, and caches', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res.retention).toBeDefined();
    expect(res.activation).toBeDefined();
    expect(res.engagement).toBeDefined();
    expect(res.growth).toBeDefined();
    expect(res.monetization).toBeDefined();
    expect(res.segments.map((s) => s.segment)).toEqual(['pl', 'other']);
    expect(res.scale).toBeDefined();
    expect(cache.set).toHaveBeenCalled();
  });

  it('computes logo churn from canceled subs (tier-independent), revenue churn null in v1', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    prisma.subscription.findMany = jest.fn().mockResolvedValue([
      { userId: 'u1', tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_u1', currentPeriodStart: new Date('2026-07-01T00:00:00Z'), currentPeriodEnd: new Date('2026-08-01T00:00:00Z'), trialStart: null, trialEnd: null, canceledAt: null, user: { language: 'en', currencyCode: 'USD' } },
      { userId: 'u2', tier: 'free', status: 'canceled', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, trialStart: null, trialEnd: null, canceledAt: new Date(), user: { language: 'en', currencyCode: 'USD' } },
    ]);
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res.monetization.payingUsers).toBe(1);
    expect(res.monetization.logoChurnMonthly).toBeCloseTo(0.5, 5); // 1 churned / (1 paying + 1 churned)
    expect(res.monetization.revenueChurnMonthly).toBeNull();
  });

  it('excludes admin-granted tiers from MRR and reports them separately', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    prisma.user.count = jest.fn().mockResolvedValue(10);
    prisma.subscription.findMany = jest.fn().mockResolvedValue([
      // real payer: monthly pro through Stripe
      { userId: 'p1', tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_p1', currentPeriodStart: new Date('2026-08-01T00:00:00Z'), currentPeriodEnd: new Date('2026-09-01T00:00:00Z'), trialStart: null, trialEnd: null, canceledAt: null, user: { language: 'pl', currencyCode: 'USD' } },
      // hand-granted business: no Stripe subscription behind it
      { userId: 'c1', tier: 'business', status: 'active', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, trialStart: null, trialEnd: null, canceledAt: null, user: { language: 'pl', currencyCode: 'USD' } },
    ]);
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);

    expect(res.monetization.payingUsers).toBe(1);
    expect(res.monetization.mrrUsd).toBeCloseTo(4.99, 2);
    expect(res.monetization.compedUsers).toBe(1);
    expect(res.monetization.compedMrrUsd).toBeCloseTo(19.99, 2);
    // ARPPU and conversion must both read off the paying set only
    expect(res.monetization.arppuUsd).toBeCloseTo(4.99, 2);
    expect(res.monetization.freeToPaidConversion).toBeCloseTo(1 / 10, 5);
  });

  it('keeps comped users out of the per-language segment MRR', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    prisma.subscription.findMany = jest.fn().mockResolvedValue([
      { userId: 'c1', tier: 'business', status: 'active', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, trialStart: null, trialEnd: null, canceledAt: null, user: { language: 'pl', currencyCode: 'PLN' } },
    ]);
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res.segments.find((s) => s.segment === 'pl')!.mrrUsd).toBe(0);
    expect(res.monetization.mrrUsd).toBe(0);
    expect(res.monetization.grossMargin).toBeNull();
  });

  it('does not count a comped tier as a trial conversion', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as any;
    const prisma = makePrisma();
    prisma.subscription.findMany = jest.fn().mockResolvedValue([
      // trial ended, then an admin granted business by hand -> not a paid conversion
      { userId: 'c1', tier: 'business', status: 'active', stripeSubscriptionId: null, currentPeriodStart: null, currentPeriodEnd: null, trialStart: new Date('2026-01-01T00:00:00Z'), trialEnd: new Date('2026-01-15T00:00:00Z'), canceledAt: null, user: { language: 'en', currencyCode: 'USD' } },
    ]);
    const svc = new AdminInvestorMetricsService(prisma, cache);
    const res = await svc.getInvestorMetrics(params);
    expect(res.monetization.trialToPaidConversion).toBe(0);
  });
});
