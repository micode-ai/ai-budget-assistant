import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubscriptionsService, formatPlanAmount } from './subscriptions.service';
import { CreateCheckoutSessionDto } from './dto';
import * as pricingData from './pricing-data.json';

// Critical subscription paths:
//   1. Tier gating — free users must be blocked at the AI request limit.
//   2. Member limit — tier-appropriate cap is enforced.
//   3. Webhook: subscription deleted → account reverts to free/canceled.
//   4. Webhook: payment failed → status set to past_due.

function makeService(prismaOverrides: Record<string, any> = {}, adminGateway?: any) {
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
    adminGateway,
  );

  return { service, prisma, telegramService, notificationsService };
}

// ── refundAiUsage (ABA-644: a mail the model calls "not a receipt" is not billed) ──

describe('SubscriptionsService — refundAiUsage', () => {
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

  describe('admin live feed', () => {
    const deletedEvent: any = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { userId: 'u1' } } },
    };
    const proSub = { tier: 'pro', status: 'active' };

    it('emits subscription-change when a paid subscription is deleted', async () => {
      const gw = { emitSubscriptionChange: jest.fn() };
      const { service } = makeService(
        { subscription: { findUnique: jest.fn().mockResolvedValue(proSub), update: jest.fn().mockResolvedValue({}) } },
        gw,
      );
      await service.handleWebhookEvent(deletedEvent);
      expect(gw.emitSubscriptionChange).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', fromTier: 'pro', toTier: 'free' }),
      );
    });

    it('emits on checkout/updated when the tier changes', async () => {
      const gw = { emitSubscriptionChange: jest.fn() };
      const { service } = makeService({}, gw);
      (service as any).resolveTierFromPrice = jest.fn().mockResolvedValue('pro');
      await service.handleWebhookEvent({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            status: 'active',
            customer: 'cus_1',
            metadata: { userId: 'u1' },
            items: { data: [{ price: { id: 'price_1' } }] },
          },
        },
      } as any);
      expect(gw.emitSubscriptionChange).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', fromTier: 'free', toTier: 'pro' }),
      );
    });

    it('still resolves when the gateway throws', async () => {
      const gw = { emitSubscriptionChange: jest.fn(() => { throw new Error('boom'); }) };
      const { service } = makeService(
        { subscription: { findUnique: jest.fn().mockResolvedValue(proSub), update: jest.fn().mockResolvedValue({}) } },
        gw,
      );
      await expect(service.handleWebhookEvent(deletedEvent)).resolves.toBeUndefined();
    });

    it('works when no gateway is injected', async () => {
      const { service } = makeService(
        { subscription: { findUnique: jest.fn().mockResolvedValue(proSub), update: jest.fn().mockResolvedValue({}) } },
      );
      await expect(service.handleWebhookEvent(deletedEvent)).resolves.toBeUndefined();
    });
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

// ── BRL pricing + "display currency = charged currency" gate ──────────────────

describe('SubscriptionsService — getPlans BRL', () => {
  const BRL_KEYS = [
    'STRIPE_PRO_MONTHLY_PRICE_ID_BRL',
    'STRIPE_PRO_YEARLY_PRICE_ID_BRL',
    'STRIPE_BUSINESS_MONTHLY_PRICE_ID_BRL',
    'STRIPE_BUSINESS_YEARLY_PRICE_ID_BRL',
  ];

  /** A service that behaves as if STRIPE_SECRET_KEY is set, with the given env. */
  function withStripeEnv(env: Record<string, string>) {
    const { service } = makeService();
    (service as any).stripe = {}; // "Stripe configured" — no call is made by getPlans
    (service as any).configService.get.mockImplementation((key: string) => env[key]);
    return service;
  }

  it('returns BRL amounts, R$ display in the app convention and the _BRL env keys', () => {
    const { service } = makeService();
    const plans = service.getPlans('BRL');
    expect(plans.currency).toBe('BRL');
    expect(plans.symbol).toBe('R$');

    const [pro, biz] = plans.plans;
    expect(pro.monthly).toEqual({ amount: 1490, display: 'R$14,90', priceEnvKey: 'STRIPE_PRO_MONTHLY_PRICE_ID_BRL' });
    expect(pro.yearly).toEqual({ amount: 8990, display: 'R$89,90', priceEnvKey: 'STRIPE_PRO_YEARLY_PRICE_ID_BRL' });
    expect(pro.monthlyEquivalent).toBe('R$7,49');
    expect(biz.monthly).toEqual({ amount: 5990, display: 'R$59,90', priceEnvKey: 'STRIPE_BUSINESS_MONTHLY_PRICE_ID_BRL' });
    expect(biz.yearly).toEqual({ amount: 57504, display: 'R$575,04', priceEnvKey: 'STRIPE_BUSINESS_YEARLY_PRICE_ID_BRL' });
    expect(biz.monthlyEquivalent).toBe('R$47,92');
  });

  it('is case-insensitive on the user currency code', () => {
    const { service } = makeService();
    expect(service.getPlans('brl').currency).toBe('BRL');
  });

  it('keeps the legacy display for the other currencies (no format change outside BRL)', () => {
    const { service } = makeService();
    expect(service.getPlans('PLN').plans[0].monthly.display).toBe('zł14.99');
    expect(service.getPlans('USD').plans[0].monthly.display).toBe('$4.99');
  });

  it('offers BRL when Stripe is configured and all four _BRL price ids are set', () => {
    const env = Object.fromEntries(BRL_KEYS.map((k) => [k, `price_${k}`]));
    const plans = withStripeEnv(env).getPlans('BRL');
    expect(plans.currency).toBe('BRL');
    expect(plans.plans[0].monthly.priceEnvKey).toBe('STRIPE_PRO_MONTHLY_PRICE_ID_BRL');
  });

  it('offers USD (display AND checkout key) when the _BRL price ids are not provisioned yet', () => {
    // A bare STRIPE_PRO_MONTHLY_PRICE_ID would let resolvePriceId() charge a BRL
    // checkout in another currency — the gate must not hand out _BRL keys here.
    const plans = withStripeEnv({ STRIPE_PRO_MONTHLY_PRICE_ID: 'price_usd_bare' }).getPlans('BRL');
    expect(plans.currency).toBe('USD');
    expect(plans.symbol).toBe('$');
    expect(plans.plans[0].monthly.priceEnvKey).toBe('STRIPE_PRO_MONTHLY_PRICE_ID_USD');
    expect(plans.plans[0].monthly.display).toBe('$4.99');
  });

  it('offers USD when only some of the _BRL price ids are set', () => {
    const plans = withStripeEnv({
      STRIPE_PRO_MONTHLY_PRICE_ID_BRL: 'price_a',
      STRIPE_PRO_YEARLY_PRICE_ID_BRL: 'price_b',
    }).getPlans('BRL');
    expect(plans.currency).toBe('USD');
  });

  it('resolvePriceId reads the exact _BRL key when set', () => {
    const service = withStripeEnv({ STRIPE_PRO_YEARLY_PRICE_ID_BRL: 'price_brl_y' });
    expect(service.resolvePriceId('STRIPE_PRO_YEARLY_PRICE_ID_BRL')).toBe('price_brl_y');
  });

  it('resolvePriceId never falls back to the un-suffixed key (it would charge another currency)', () => {
    const bare = withStripeEnv({ STRIPE_PRO_YEARLY_PRICE_ID: 'price_bare' });
    expect(() => bare.resolvePriceId('STRIPE_PRO_YEARLY_PRICE_ID_BRL')).toThrow(
      'No Stripe price configured for STRIPE_PRO_YEARLY_PRICE_ID_BRL',
    );
  });

  it('warns about an unprovisioned currency once, not on every request', () => {
    const service = withStripeEnv({});
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    service.getPlans('BRL');
    service.getPlans('BRL');
    service.getPlans('PLN');
    expect(warn).toHaveBeenCalledTimes(2); // once for BRL, once for PLN
  });

  it('webhook tier resolution recognises a _BRL price id from env (no Stripe lookup)', async () => {
    const service = withStripeEnv({
      STRIPE_PRO_MONTHLY_PRICE_ID_BRL: 'price_pro_brl',
      STRIPE_BUSINESS_YEARLY_PRICE_ID_BRL: 'price_biz_brl',
    });
    await expect((service as any).resolveTierFromPrice('price_pro_brl')).resolves.toBe('pro');
    await expect((service as any).resolveTierFromPrice('price_biz_brl')).resolves.toBe('business');
  });
});

describe('formatPlanAmount', () => {
  it('groups BRL thousands with a dot and uses a comma decimal', () => {
    expect(formatPlanAmount('BRL', 'R$', 123450)).toBe('R$1.234,50');
    expect(formatPlanAmount('BRL', 'R$', 5)).toBe('R$0,05');
  });

  it('leaves a currency without a display rule in the legacy form', () => {
    expect(formatPlanAmount('UAH', '₴', 382900)).toBe('₴3829.00');
  });
});

// ── createCheckoutSession price-key allow-list ────────────────────────────────
//
// The client sends a price ENV KEY. Without an allow-list a user could pay a
// cheaper currency's PPP price they were never offered, or name any env var
// (JWT_SECRET) and have its value sent to Stripe as a price id.

describe('SubscriptionsService — createCheckoutSession allow-list', () => {
  const ALL = ['BRL', 'USD', 'UAH', 'PLN'].flatMap((c) => [
    `STRIPE_PRO_MONTHLY_PRICE_ID_${c}`,
    `STRIPE_PRO_YEARLY_PRICE_ID_${c}`,
    `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${c}`,
    `STRIPE_BUSINESS_YEARLY_PRICE_ID_${c}`,
  ]);

  function checkoutService() {
    const { service } = makeService();
    const sessionsCreate = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout' });
    (service as any).stripe = { checkout: { sessions: { create: sessionsCreate } } };
    const env: Record<string, string> = { JWT_SECRET: 'secret' };
    for (const k of ALL) env[k] = `price_${k}`;
    (service as any).configService.get.mockImplementation((key: string) => env[key]);
    jest.spyOn(service, 'getOrCreateStripeCustomer').mockResolvedValue('cus_1');
    return { service, sessionsCreate };
  }

  it('accepts the key offered for the user currency', async () => {
    const { service, sessionsCreate } = checkoutService();
    await expect(
      service.createCheckoutSession('u1', 'STRIPE_PRO_MONTHLY_PRICE_ID_BRL', 's', 'c', 'BRL'),
    ).resolves.toEqual({ sessionId: 'cs_1', url: 'https://checkout' });
    expect(sessionsCreate.mock.calls[0][0].line_items).toEqual([
      { price: 'price_STRIPE_PRO_MONTHLY_PRICE_ID_BRL', quantity: 1 },
    ]);
  });

  it('accepts the USD keys for any user', async () => {
    const { service } = checkoutService();
    await expect(
      service.createCheckoutSession('u1', 'STRIPE_BUSINESS_YEARLY_PRICE_ID_USD', 's', 'c', 'BRL'),
    ).resolves.toBeDefined();
  });

  it('refuses another currency key (a cheaper PPP price the user was not offered) with 400', async () => {
    const { service, sessionsCreate } = checkoutService();
    await expect(
      service.createCheckoutSession('u1', 'STRIPE_PRO_MONTHLY_PRICE_ID_UAH', 's', 'c', 'BRL'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('refuses an arbitrary env var name with 400 and never reads it', async () => {
    const { service, sessionsCreate } = checkoutService();
    const get = (service as any).configService.get as jest.Mock;
    await expect(
      service.createCheckoutSession('u1', 'JWT_SECRET', 's', 'c', 'PLN'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(get).not.toHaveBeenCalledWith('JWT_SECRET');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('a user whose currency has no row (BYN) may only use the USD keys', async () => {
    const { service } = checkoutService();
    await expect(
      service.createCheckoutSession('u1', 'STRIPE_PRO_MONTHLY_PRICE_ID_PLN', 's', 'c', 'BYN'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createCheckoutSession('u1', 'STRIPE_PRO_MONTHLY_PRICE_ID_USD', 's', 'c', 'BYN'),
    ).resolves.toBeDefined();
  });
});

describe('CreateCheckoutSessionDto', () => {
  const check = (priceId: string) =>
    validateSync(plainToInstance(CreateCheckoutSessionDto, { priceId, successUrl: 's', cancelUrl: 'c' }));

  it('accepts a price env key', () => {
    expect(check('STRIPE_BUSINESS_YEARLY_PRICE_ID_BRL')).toHaveLength(0);
  });

  it.each(['JWT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'price_123', 'STRIPE_PRO_MONTHLY_PRICE_ID_brl'])(
    'rejects %s',
    (priceId) => {
      expect(check(priceId).length).toBeGreaterThan(0);
    },
  );
});

// ── getOrCreateSubscription (upsert race, ABA-314) ────────────────────────────

describe('SubscriptionsService — getOrCreateSubscription (upsert race)', () => {
  const p2002 = Object.assign(new Error('Unique constraint failed on the fields: (userId)'), {
    code: 'P2002',
  });

  it('re-fetches instead of crashing when a concurrent request already created the row (P2002)', async () => {
    const existing = { id: 'sub-x', userId: 'u1', tier: 'free', status: 'active' };
    const { service, prisma } = makeService({
      subscription: {
        upsert: jest.fn().mockRejectedValue(p2002),
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    });
    await expect(service.getOrCreateSubscription('u1')).resolves.toEqual(existing);
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('rethrows P2002 if the row still cannot be found afterwards', async () => {
    const { service } = makeService({
      subscription: {
        upsert: jest.fn().mockRejectedValue(p2002),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(service.getOrCreateSubscription('u1')).rejects.toBe(p2002);
  });

  it('rethrows non-P2002 errors as-is', async () => {
    const other = Object.assign(new Error('db down'), { code: 'P1001' });
    const { service } = makeService({
      subscription: { upsert: jest.fn().mockRejectedValue(other) },
    });
    await expect(service.getOrCreateSubscription('u1')).rejects.toBe(other);
  });
});

// ── recordAdditionalUsage (ocr-reread-cost-not-tracked) ───────────────────────
//
// Used by OcrService to report a corrective re-read's real second OpenAI
// call — a cost `AiUsageGuard`'s canActivate-time decorator can never see,
// since it runs before the handler. Must write a usage-log row for admin
// AI-COGS but must NOT touch the monthly quota, and must never throw (the
// OpenAI call already happened and was billed).

describe('SubscriptionsService — recordAdditionalUsage', () => {
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

// pricing-data.json is the single source of truth for subscription pricing
// (tech-debt pricing-table-triple-copy) — also read by setup-stripe-products.ts
// and docs/marketing/landing/build_landing.py. This guards its shape so a bad
// edit fails fast in CI instead of silently breaking getPlans()/checkout/the
// landing page.
describe('pricing-data.json', () => {
  const REQUIRED_FIELDS = ['symbol', 'pro_monthly', 'pro_yearly', 'biz_monthly', 'biz_yearly'] as const;

  it('has a USD entry (the universal fallback currency)', () => {
    expect(pricingData.currencies.USD).toBeDefined();
  });

  it('every currency has all required numeric fields plus a symbol, and yearly < monthly*12', () => {
    for (const [code, entry] of Object.entries(pricingData.currencies)) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry).toHaveProperty(field);
      }
      expect(typeof entry.symbol).toBe('string');
      expect(entry.symbol.length).toBeGreaterThan(0);
      expect(entry.pro_yearly).toBeLessThan(entry.pro_monthly * 12);
      expect(entry.biz_yearly).toBeLessThan(entry.biz_monthly * 12);
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('drives getPlans() output (no independent copy left in subscriptions.service.ts)', () => {
    const { service } = makeService();
    const plans = service.getPlans('PLN');
    const expected = pricingData.currencies.PLN;
    expect(plans.symbol).toBe(expected.symbol);
    expect(plans.plans[0].monthly.amount).toBe(expected.pro_monthly);
    expect(plans.plans[1].yearly.amount).toBe(expected.biz_yearly);
  });
});

describe('SubscriptionsService - resetUsageIfNeeded zeroes leaflet pages', () => {
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
