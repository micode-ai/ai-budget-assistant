import { BadRequestException } from '@nestjs/common';
import { makeServices } from './subscriptions.spec-helpers';

// Stripe billing lifecycle: webhooks (subscription deleted/updated, payment failed), checkout allow-list.
function makeService(prismaOverrides: Record<string, any> = {}, adminGateway?: any) {
  const r = makeServices(prismaOverrides, adminGateway);
  return { ...r, service: r.billing };
}

// ── handleWebhookEvent ────────────────────────────────────────────────────────

describe('StripeBillingService — handleWebhookEvent', () => {
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

// ── createCheckoutSession price-key allow-list ────────────────────────────────
//
// The client sends a price ENV KEY. Without an allow-list a user could pay a
// cheaper currency's PPP price they were never offered, or name any env var
// (JWT_SECRET) and have its value sent to Stripe as a price id.

describe('StripeBillingService — createCheckoutSession allow-list', () => {
  const ALL = ['BRL', 'USD', 'UAH', 'PLN'].flatMap((c) => [
    `STRIPE_PRO_MONTHLY_PRICE_ID_${c}`,
    `STRIPE_PRO_YEARLY_PRICE_ID_${c}`,
    `STRIPE_BUSINESS_MONTHLY_PRICE_ID_${c}`,
    `STRIPE_BUSINESS_YEARLY_PRICE_ID_${c}`,
  ]);

  function checkoutService() {
    const { service, configService } = makeService();
    const sessionsCreate = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout' });
    (service as any).stripe = { checkout: { sessions: { create: sessionsCreate } } };
    const env: Record<string, string> = { JWT_SECRET: 'secret', STRIPE_SECRET_KEY: 'sk_test' };
    for (const k of ALL) env[k] = `price_${k}`;
    configService.get.mockImplementation((key: string) => env[key]);
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

describe('StripeBillingService — tier resolution', () => {
  it('webhook tier resolution recognises a _BRL price id from env (no Stripe lookup)', async () => {
    const { service, configService } = makeService();
    const env: Record<string, string> = {
      STRIPE_PRO_MONTHLY_PRICE_ID_BRL: 'price_pro_brl',
      STRIPE_BUSINESS_YEARLY_PRICE_ID_BRL: 'price_biz_brl',
    };
    configService.get.mockImplementation((key: string) => env[key]);
    await expect((service as any).resolveTierFromPrice('price_pro_brl')).resolves.toBe('pro');
    await expect((service as any).resolveTierFromPrice('price_biz_brl')).resolves.toBe('business');
  });
});
