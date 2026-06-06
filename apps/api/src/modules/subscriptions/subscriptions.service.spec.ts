import { ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

// Critical subscription paths:
//   1. Tier gating — free users must be blocked at the AI request limit.
//   2. Member limit — tier-appropriate cap is enforced.
//   3. Webhook: subscription deleted → account reverts to free/canceled.
//   4. Webhook: payment failed → status set to past_due.

function makeService(prismaOverrides: Record<string, any> = {}) {
  const baseSub = {
    id: 'sub-1',
    userId: 'u1',
    tier: 'free',
    status: 'active',
    aiRequestsUsed: 0,
    aiRequestsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
    customAiLimit: null,
    bonusAiRequests: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialStart: null,
    trialEnd: null,
  };

  const prisma: any = {
    subscription: {
      upsert: jest.fn().mockResolvedValue(baseSub),
      findUnique: jest.fn().mockResolvedValue(baseSub),
      findUniqueOrThrow: jest.fn().mockResolvedValue(baseSub),
      update: jest.fn().mockResolvedValue(baseSub),
    },
    accountMember: {
      count: jest.fn().mockResolvedValue(0),
    },
    usageLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (cmds: any) => {
      if (Array.isArray(cmds)) return Promise.all(cmds);
      return cmds();
    }),
    ...prismaOverrides,
  };

  const configService: any = {
    // No STRIPE_SECRET_KEY → service skips constructing a real Stripe client
    get: jest.fn().mockReturnValue(undefined),
  };

  const telegramService: any = { notifyNewSubscription: jest.fn() };
  const notificationsService: any = { sendToUser: jest.fn().mockReturnValue(Promise.resolve()) };
  const mailService: any = { sendMail: jest.fn() };

  const service = new SubscriptionsService(
    prisma,
    configService,
    telegramService,
    notificationsService,
    mailService,
  );

  return { service, prisma, telegramService, notificationsService };
}

// ── trackAiUsage ──────────────────────────────────────────────────────────────

describe('SubscriptionsService — trackAiUsage (tier gating)', () => {
  it('throws ForbiddenException when free-tier AI usage would exceed the monthly limit', async () => {
    const { service, prisma } = makeService({
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

// ── getOrCreateSubscription (race safety) ─────────────────────────────────────

describe('SubscriptionsService — getOrCreateSubscription', () => {
  it('falls back to findUniqueOrThrow when a concurrent insert wins the race (P2002)', async () => {
    const existingSub = {
      id: 'sub-1',
      userId: 'u1',
      tier: 'free',
      status: 'active',
    };
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const { service, prisma } = makeService({
      subscription: {
        upsert: jest.fn().mockRejectedValue(p2002),
        findUniqueOrThrow: jest.fn().mockResolvedValue(existingSub),
      },
    });

    await expect(service.getOrCreateSubscription('u1')).resolves.toEqual(existingSub);
    expect(prisma.subscription.findUniqueOrThrow).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('rethrows non-P2002 errors', async () => {
    const otherError = Object.assign(new Error('connection lost'), { code: 'P1001' });
    const { service } = makeService({
      subscription: {
        upsert: jest.fn().mockRejectedValue(otherError),
        findUniqueOrThrow: jest.fn(),
      },
    });

    await expect(service.getOrCreateSubscription('u1')).rejects.toThrow('connection lost');
  });
});

// ── checkMemberLimit ──────────────────────────────────────────────────────────

describe('SubscriptionsService — checkMemberLimit', () => {
  it('throws ForbiddenException when free-tier member count is at the limit (1)', async () => {
    const { service, prisma } = makeService({
      accountMember: { count: jest.fn().mockResolvedValue(1) },
    });

    await expect(service.checkMemberLimit('u1', 'acc-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows adding a member when the count is below the tier limit', async () => {
    const { service, prisma } = makeService({
      accountMember: { count: jest.fn().mockResolvedValue(0) },
    });

    await expect(service.checkMemberLimit('u1', 'acc-1')).resolves.not.toThrow();
  });
});

// ── handleWebhookEvent ────────────────────────────────────────────────────────

describe('SubscriptionsService — handleWebhookEvent', () => {
  it('reverts subscription to free/canceled on customer.subscription.deleted', async () => {
    const { service, prisma } = makeService();

    const event: any = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'stripe-sub-1',
          metadata: { userId: 'u1' },
          status: 'canceled',
          cancel_at_period_end: false,
          trial_start: null,
          trial_end: null,
          items: { data: [] },
          customer: 'cus-1',
        },
      },
    };

    await service.handleWebhookEvent(event);

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          tier: 'free',
          status: 'canceled',
        }),
      }),
    );
  });

  it('sets subscription status to past_due on invoice.payment_failed', async () => {
    const existingSub = {
      id: 'sub-1',
      userId: 'u1',
      tier: 'pro',
      stripeCustomerId: 'cus-1',
    };
    const { service, prisma, notificationsService } = makeService({
      subscription: {
        findUnique: jest.fn().mockResolvedValue(existingSub),
        update: jest.fn().mockResolvedValue(existingSub),
        upsert: jest.fn().mockResolvedValue(existingSub),
      },
    });

    const event: any = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus-1',
          amount_paid: 0,
          currency: 'usd',
        },
      },
    };

    await service.handleWebhookEvent(event);

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { status: 'past_due' },
      }),
    );
    expect(notificationsService.sendToUser).toHaveBeenCalled();
  });

  it('does not throw for unhandled event types (graceful no-op)', async () => {
    const { service } = makeService();
    const event: any = { type: 'unhandled.event.type', data: { object: {} } };
    await expect(service.handleWebhookEvent(event)).resolves.not.toThrow();
  });
});

// ── getPlans (pure function, no DB) ──────────────────────────────────────────

describe('SubscriptionsService — getPlans', () => {
  it('returns PLN pricing when currencyCode is PLN', () => {
    const { service } = makeService();
    const plans = service.getPlans('PLN');
    expect(plans.currency).toBe('PLN');
    expect(plans.symbol).toBe('zł');
    expect(plans.plans).toHaveLength(2);
  });

  it('falls back to USD pricing for an unknown currency', () => {
    const { service } = makeService();
    const plans = service.getPlans('XYZ');
    expect(plans.currency).toBe('USD');
  });
});
