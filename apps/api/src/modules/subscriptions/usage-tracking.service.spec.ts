import { ForbiddenException } from '@nestjs/common';
import { makeServices } from './subscriptions.spec-helpers';

// AI usage metering: tier gating, member limit, refund, additional usage, monthly reset.
function makeService(prismaOverrides: Record<string, any> = {}, adminGateway?: any) {
  const r = makeServices(prismaOverrides, adminGateway);
  return { ...r, service: r.usage };
}

// ── refundAiUsage (ABA-644: a mail the model calls "not a receipt" is not billed) ──

describe('UsageTrackingService — refundAiUsage', () => {
  const subWith = (aiRequestsUsed: number) => ({
    id: 'sub-1', userId: 'u1', tier: 'free', status: 'active', aiRequestsUsed,
    aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    customAiLimit: null, bonusAiRequests: 0,
  });

  it('decrements the counter and records a negative usage-log row', async () => {
    const { service, prisma } = makeService({
      subscription: {
        upsert: jest.fn().mockResolvedValue(subWith(10)),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    await service.refundAiUsage('u1', 'ocr', 2, 'acc-1');
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { aiRequestsUsed: { decrement: 2 } } });
    expect(prisma.usageLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', subscriptionId: 'sub-1', featureType: 'ocr', costUnits: -2, accountId: 'acc-1' },
    });
  });

  it('never takes the counter below zero (a period reset between charge and refund)', async () => {
    const { service, prisma } = makeService({
      subscription: { upsert: jest.fn().mockResolvedValue(subWith(0.5)), update: jest.fn().mockResolvedValue({}) },
    });
    await service.refundAiUsage('u1', 'ocr', 2);
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { aiRequestsUsed: { decrement: 0.5 } } });

    const zero = makeService({
      subscription: { upsert: jest.fn().mockResolvedValue(subWith(0)), update: jest.fn() },
    });
    await zero.service.refundAiUsage('u1', 'ocr', 2);
    expect(zero.prisma.subscription.update).not.toHaveBeenCalled();
  });
});

// ── trackAiUsage ──────────────────────────────────────────────────────────────

describe('UsageTrackingService — trackAiUsage (tier gating)', () => {
  it('throws ForbiddenException when free-tier AI usage would exceed the monthly limit', async () => {
    const { service } = makeService({
      subscription: {
        upsert: jest.fn().mockResolvedValue({
          id: 'sub-1',
          userId: 'u1',
          tier: 'free',
          status: 'active',
          aiRequestsUsed: 49, // 1 away from free limit (50)
          aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          customAiLimit: null,
          bonusAiRequests: 0,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'sub-1',
          tier: 'free',
          status: 'active',
          aiRequestsUsed: 49,
          aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          customAiLimit: null,
          bonusAiRequests: 0,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'sub-1',
          tier: 'free',
          status: 'active',
          aiRequestsUsed: 49,
          aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          customAiLimit: null,
          bonusAiRequests: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    // costUnits = 2 → 49 + 2 = 51 > 50 → should throw
    await expect(service.trackAiUsage('u1', 'chat', 2)).rejects.toThrow(ForbiddenException);
  });

  it('allows usage when the free-tier limit is not exceeded', async () => {
    const { service, prisma } = makeService();

    // Default: aiRequestsUsed=0, limit=50, costUnits=1 → 1 <= 50 → allowed
    await expect(service.trackAiUsage('u1', 'chat', 1)).resolves.not.toThrow();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('skips the limit check for an active business-tier subscription (unlimited)', async () => {
    const businessSub = {
      id: 'sub-biz',
      userId: 'u1',
      tier: 'business',
      status: 'active',
      aiRequestsUsed: 9999,
      aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customAiLimit: null,
      bonusAiRequests: 0,
    };
    const { service, prisma } = makeService({
      subscription: {
        upsert: jest.fn().mockResolvedValue(businessSub),
        findUniqueOrThrow: jest.fn().mockResolvedValue(businessSub),
        findUnique: jest.fn().mockResolvedValue(businessSub),
        update: jest.fn().mockResolvedValue({}),
      },
      usageLog: { create: jest.fn().mockResolvedValue({}) },
    });

    await expect(service.trackAiUsage('u1', 'chat', 100)).resolves.not.toThrow();
    // business tier goes straight to logUsage without touching $transaction (no increment)
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ── checkMemberLimit ──────────────────────────────────────────────────────────

describe('UsageTrackingService — checkMemberLimit', () => {
  it('throws ForbiddenException when free-tier member count is at the limit (1)', async () => {
    const { service } = makeService({
      accountMember: { count: jest.fn().mockResolvedValue(1) },
    });

    await expect(service.checkMemberLimit('u1', 'acc-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows adding a member when the count is below the tier limit', async () => {
    const { service } = makeService({
      accountMember: { count: jest.fn().mockResolvedValue(0) },
    });

    await expect(service.checkMemberLimit('u1', 'acc-1')).resolves.not.toThrow();
  });
});

// ── recordAdditionalUsage (ocr-reread-cost-not-tracked) ───────────────────────
//
// Used by OcrService to report a corrective re-read's real second OpenAI
// call — a cost `AiUsageGuard`'s canActivate-time decorator can never see,
// since it runs before the handler. Must write a usage-log row for admin
// AI-COGS but must NOT touch the monthly quota, and must never throw (the
// OpenAI call already happened and was billed).

describe('UsageTrackingService — recordAdditionalUsage', () => {
  it('writes a usage-log row without incrementing the monthly quota', async () => {
    const { service, prisma } = makeService();

    await service.recordAdditionalUsage('u1', 'ocr_reread', 2.0, 'acc-1');

    expect(prisma.usageLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        subscriptionId: 'sub-1',
        featureType: 'ocr_reread',
        costUnits: 2.0,
        accountId: 'acc-1',
      },
    });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('swallows an error instead of throwing (the OpenAI call already happened)', async () => {
    const { service, prisma } = makeService({
      usageLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    });

    await expect(
      service.recordAdditionalUsage('u1', 'ocr_reread', 2.0, 'acc-1'),
    ).resolves.not.toThrow();
    expect(prisma.usageLog.create).toHaveBeenCalled();
  });
});

describe('UsageTrackingService - resetUsageIfNeeded zeroes leaflet pages', () => {
  it('a reset month zeroes leafletPagesUsed together with aiRequestsUsed', async () => {
    const { service, prisma } = makeService();
    await service.resetUsageIfNeeded({
      id: 'sub-1',
      aiRequestsResetAt: new Date(Date.now() - 1000),
    } as any);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiRequestsUsed: 0, leafletPagesUsed: 0 }),
      }),
    );
  });

  it('does not reset inside the month', async () => {
    const { service, prisma } = makeService();
    await service.resetUsageIfNeeded({
      id: 'sub-1',
      aiRequestsResetAt: new Date(Date.now() + 100000),
    } as any);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
