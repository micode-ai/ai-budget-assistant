import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { formatPlanAmount } from './subscriptions.service';
import { CreateCheckoutSessionDto } from './dto';
import * as pricingData from './pricing-data.json';
import { makeServices } from './subscriptions.spec-helpers';

// Plans, display currency, pricing-data shape and the subscription row (upsert race).
function makeService(prismaOverrides: Record<string, any> = {}, adminGateway?: any) {
  const r = makeServices(prismaOverrides, adminGateway);
  return { ...r, service: r.subscriptions };
}

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
    const { service, configService } = makeService();
    configService.get.mockImplementation((key: string) => ({ STRIPE_SECRET_KEY: 'sk_test', ...env })[key]); // "Stripe configured"
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
