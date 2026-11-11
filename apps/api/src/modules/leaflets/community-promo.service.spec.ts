import { CommunityPromoService } from './community-promo.service';
import { computeContributorKey } from '../community-prices/community-price.util';
import { promoKey } from './community-promo.util';
import type { RawLeafletItem } from './leaflet-page.util';

const SALT = 'test-salt-test-salt-test-salt-test-salt'; // >= 32 chars
const DAY = 86_400_000;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const ON = { COMMUNITY_PROMOS_ENABLED: 'true', COMMUNITY_PRICE_SALT: SALT };

function item(over: Partial<RawLeafletItem> = {}): RawLeafletItem {
  return {
    name: 'Masło Łaciate',
    canonicalName: 'Masło Łaciate 200g',
    promoPrice: 4.99,
    regularPrice: 7.49,
    currencyCode: 'PLN',
    condition: 'z aplikacją',
    validFrom: null,
    validTo: null,
    basketIndex: 0,
    ...over,
  };
}

function build(env: Record<string, string> = ON, userOver: Record<string, unknown> = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        contributeCommunityPrices: true,
        leafletConsentNoticeAt: new Date(Date.now() - DAY),
        createdAt: new Date(Date.now() - 100 * DAY),
        ...userOver,
      }),
    },
    expense: { count: jest.fn().mockResolvedValue(50) },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    communityPromoObservation: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    leaflet: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const config = { get: jest.fn((k: string) => env[k]) } as any;
  const cache: any = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    incrementWindow: jest.fn().mockResolvedValue(1),
  };
  const service = new CommunityPromoService(prisma, config, cache);
  return { service, prisma, cache, config };
}

const contribute = (svc: CommunityPromoService, over: { chain?: string | null; from?: string | null; to?: string | null } = {}, opts?: { isAdmin?: boolean; leafletId?: string }) =>
  svc.contribute(
    'u1',
    over.chain === undefined ? 'biedronka' : over.chain,
    [item()],
    over.from === undefined ? ymd(-1) : over.from,
    over.to === undefined ? ymd(5) : over.to,
    opts,
  );

describe('CommunityPromoService.contribute', () => {
  it('flag off → disabled and no write', async () => {
    const { service, prisma } = build({ COMMUNITY_PRICE_SALT: SALT });
    await expect(contribute(service)).resolves.toBe('disabled');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('flag on but no usable salt → disabled', async () => {
    const short = build({ COMMUNITY_PROMOS_ENABLED: 'true', COMMUNITY_PRICE_SALT: 'too-short' });
    await expect(contribute(short.service)).resolves.toBe('disabled');
    const none = build({ COMMUNITY_PROMOS_ENABLED: 'true' });
    await expect(contribute(none.service)).resolves.toBe('disabled');
    expect(none.prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('no consent → no_consent', async () => {
    const { service, prisma } = build(ON, { contributeCommunityPrices: false });
    await expect(contribute(service)).resolves.toBe('no_consent');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('consent given before the leaflet notice was seen → no_notice', async () => {
    const { service, prisma } = build(ON, { leafletConsentNoticeAt: null });
    await expect(contribute(service)).resolves.toBe('no_notice');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('consent is checked before the notice', async () => {
    const { service } = build(ON, { contributeCommunityPrices: false, leafletConsentNoticeAt: null });
    await expect(contribute(service)).resolves.toBe('no_consent');
  });

  it('no_validity when validTo is null', async () => {
    const { service, prisma } = build();
    await expect(contribute(service, { to: null })).resolves.toBe('no_validity');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('no_validity when validFrom or the chain is missing, or the promo has already ended', async () => {
    const { service } = build();
    await expect(contribute(service, { from: null })).resolves.toBe('no_validity');
    await expect(contribute(service, { chain: null })).resolves.toBe('no_validity');
    await expect(contribute(service, { chain: '   ' })).resolves.toBe('no_validity');
    await expect(contribute(service, { from: ymd(-10), to: ymd(-1) })).resolves.toBe('no_validity');
    await expect(contribute(service, { from: 'garbage', to: ymd(3) })).resolves.toBe('no_validity');
    await expect(contribute(service, { from: ymd(5), to: ymd(1) })).resolves.toBe('no_validity');
  });

  it('a promo ending today is still valid', async () => {
    const { service } = build();
    await expect(contribute(service, { from: ymd(-3), to: ymd(0) })).resolves.toBe('ok');
  });

  it('validity is checked before eligibility', async () => {
    const { service, prisma } = build(ON, { createdAt: new Date() });
    await expect(contribute(service, { to: null })).resolves.toBe('no_validity');
    expect(prisma.expense.count).not.toHaveBeenCalled();
  });

  it('a too-new user → not_eligible', async () => {
    const { service, prisma, cache } = build(ON, { createdAt: new Date(Date.now() - 2 * DAY) });
    await expect(contribute(service)).resolves.toBe('not_eligible');
    expect(cache.incrementWindow).not.toHaveBeenCalled();
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('too few expenses → not_eligible; the thresholds are the community-price env vars', async () => {
    const few = build();
    few.prisma.expense.count.mockResolvedValue(3);
    await expect(contribute(few.service)).resolves.toBe('not_eligible');

    const relaxed = build({ ...ON, COMMUNITY_MIN_CONTRIBUTOR_EXPENSES: '2' });
    relaxed.prisma.expense.count.mockResolvedValue(3);
    await expect(contribute(relaxed.service)).resolves.toBe('ok');
  });

  it('more than 3 leaflets a day → rate_limited, keyed on the contributor key', async () => {
    const { service, prisma, cache } = build();
    cache.incrementWindow.mockResolvedValue(4);
    await expect(contribute(service)).resolves.toBe('rate_limited');
    const key = computeContributorKey(SALT, 'u1');
    expect(cache.incrementWindow).toHaveBeenCalledWith(`promo:contrib:${key}`, DAY);
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('the third leaflet of the day still contributes', async () => {
    const { service, cache } = build();
    cache.incrementWindow.mockResolvedValue(3);
    await expect(contribute(service)).resolves.toBe('ok');
  });

  it('Redis error → rate_limited (fails closed), never throws', async () => {
    const { service, prisma, cache } = build();
    cache.incrementWindow.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(contribute(service)).resolves.toBe('rate_limited');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('pages of one leaflet count as one leaflet: later pages reuse the first page verdict', async () => {
    const { service, cache } = build();
    cache.get.mockResolvedValueOnce(null).mockResolvedValueOnce('ok');
    await expect(contribute(service, {}, { leafletId: 'lf1' })).resolves.toBe('ok');
    await expect(contribute(service, {}, { leafletId: 'lf1' })).resolves.toBe('ok');
    expect(cache.incrementWindow).toHaveBeenCalledTimes(1);
    const key = computeContributorKey(SALT, 'u1');
    expect(cache.get).toHaveBeenCalledWith(`promo:contrib:lf:${key}:lf1`);
    expect(cache.set).toHaveBeenCalledWith(`promo:contrib:lf:${key}:lf1`, 'ok', expect.any(Number));
  });

  it('the per-leaflet verdict is per contributor: a second reader of the same leaflet spends their own unit', async () => {
    const { service, cache } = build();
    const verdicts = new Map<string, string>();
    cache.get.mockImplementation(async (k: string) => verdicts.get(k) ?? null);
    cache.set.mockImplementation(async (k: string, v: string) => {
      verdicts.set(k, v);
    });
    await expect(service.contribute('u1', 'biedronka', [item()], ymd(-1), ymd(5), { leafletId: 'lf1' })).resolves.toBe('ok');
    await expect(service.contribute('u2', 'biedronka', [item()], ymd(-1), ymd(5), { leafletId: 'lf1' })).resolves.toBe('ok');
    expect(cache.incrementWindow).toHaveBeenCalledTimes(2);
    expect(cache.incrementWindow).toHaveBeenCalledWith(`promo:contrib:${computeContributorKey(SALT, 'u1')}`, DAY);
    expect(cache.incrementWindow).toHaveBeenCalledWith(`promo:contrib:${computeContributorKey(SALT, 'u2')}`, DAY);
    expect(verdicts.has(`promo:contrib:lf:${computeContributorKey(SALT, 'u2')}:lf1`)).toBe(true);
  });

  it('a later page of a refused leaflet stays refused', async () => {
    const { service, cache, prisma } = build();
    cache.get.mockResolvedValue('limited');
    await expect(contribute(service, {}, { leafletId: 'lf1' })).resolves.toBe('rate_limited');
    expect(cache.incrementWindow).not.toHaveBeenCalled();
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('ok → writes one row per usable item with skipDuplicates, and no account / user id', async () => {
    const { service, prisma } = build();
    const from = ymd(-1);
    const to = ymd(5);
    const res = await service.contribute(
      'u1',
      'biedronka',
      [
        item(),
        item({ canonicalName: 'Kawa Lavazza 1kg', promoPrice: 39.999, condition: null }),
        item({ canonicalName: '', promoPrice: 2 }), // no name
        item({ canonicalName: 'Ser', promoPrice: 0 }), // no price
        item({ canonicalName: 'x'.repeat(65) }), // oversized label
      ],
      from,
      to,
    );
    expect(res).toBe('ok');
    const call = prisma.communityPromoObservation.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(2);
    const key = computeContributorKey(SALT, 'u1');
    for (const row of call.data) {
      expect(row).not.toHaveProperty('accountId');
      expect(row).not.toHaveProperty('userId');
      expect(JSON.stringify(row)).not.toContain('u1');
      expect(row.contributorKey).toBe(key);
      expect(row.isAdmin).toBe(false);
      expect(row.adminLeafletId).toBeNull();
      expect(row.chain).toBe('biedronka');
      expect(row.validFrom).toEqual(new Date(`${from}T00:00:00.000Z`));
      expect(row.validTo).toEqual(new Date(`${to}T00:00:00.000Z`));
    }
    expect(call.data[0]).toMatchObject({ canonicalName: 'Masło Łaciate 200g', promoPrice: 4.99, currencyCode: 'PLN', condition: 'z aplikacją' });
    expect(call.data[1]).toMatchObject({ canonicalName: 'Kawa Lavazza 1kg', promoPrice: 40, condition: null });
  });

  it('no usable items → ok without a write', async () => {
    const { service, prisma } = build();
    await expect(service.contribute('u1', 'biedronka', [], ymd(-1), ymd(5))).resolves.toBe('ok');
    expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
  });

  it('trusted by tenure, as community prices define it', async () => {
    const { service, prisma } = build();
    await contribute(service);
    expect(prisma.communityPromoObservation.createMany.mock.calls[0][0].data[0].trusted).toBe(true);
  });

  it('a newer user is trusted only when paying through Stripe — never on a comp', async () => {
    const comp = build(ON, { createdAt: new Date(Date.now() - 20 * DAY) });
    comp.prisma.subscription.findUnique.mockResolvedValue({ tier: 'pro', status: 'active', stripeSubscriptionId: null });
    await contribute(comp.service);
    expect(comp.prisma.communityPromoObservation.createMany.mock.calls[0][0].data[0].trusted).toBe(false);

    const paid = build(ON, { createdAt: new Date(Date.now() - 20 * DAY) });
    paid.prisma.subscription.findUnique.mockResolvedValue({ tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_1' });
    await contribute(paid.service);
    expect(paid.prisma.communityPromoObservation.createMany.mock.calls[0][0].data[0].trusted).toBe(true);
  });

  it('a database error never throws into the caller', async () => {
    const { service, prisma } = build();
    prisma.communityPromoObservation.createMany.mockRejectedValue(new Error('db down'));
    await expect(contribute(service)).resolves.toBe('failed');
    prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    await expect(contribute(service)).resolves.toBe('failed');
  });

  describe('admin reader (R3)', () => {
    it('contributes as isAdmin + trusted and skips consent, notice, eligibility and the rate limit', async () => {
      const { service, prisma, cache } = build(ON, {
        contributeCommunityPrices: false,
        leafletConsentNoticeAt: null,
        createdAt: new Date(),
      });
      prisma.expense.count.mockResolvedValue(0);
      cache.incrementWindow.mockRejectedValue(new Error('redis down'));
      await expect(contribute(service, {}, { isAdmin: true, leafletId: 'lf1' })).resolves.toBe('ok');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(cache.incrementWindow).not.toHaveBeenCalled();
      const row = prisma.communityPromoObservation.createMany.mock.calls[0][0].data[0];
      expect(row).toMatchObject({ isAdmin: true, trusted: true, adminLeafletId: null });
      expect(row.contributorKey).toBe(computeContributorKey(SALT, 'u1'));
    });

    it('still needs the flag and a usable salt', async () => {
      const off = build({ COMMUNITY_PRICE_SALT: SALT });
      await expect(contribute(off.service, {}, { isAdmin: true })).resolves.toBe('disabled');
      const noSalt = build({ COMMUNITY_PROMOS_ENABLED: 'true' });
      await expect(contribute(noSalt.service, {}, { isAdmin: true })).resolves.toBe('disabled');
      expect(off.prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
      expect(noSalt.prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
    });

    it('still needs the chain and both validity dates with validTo >= today', async () => {
      const { service, prisma } = build();
      await expect(contribute(service, { chain: null }, { isAdmin: true })).resolves.toBe('no_validity');
      await expect(contribute(service, { from: null }, { isAdmin: true })).resolves.toBe('no_validity');
      await expect(contribute(service, { to: null }, { isAdmin: true })).resolves.toBe('no_validity');
      await expect(contribute(service, { from: ymd(-9), to: ymd(-2) }, { isAdmin: true })).resolves.toBe('no_validity');
      expect(prisma.communityPromoObservation.createMany).not.toHaveBeenCalled();
    });
  });
});

describe('CommunityPromoService.confirmedActive', () => {
  const now = new Date();
  const to = new Date(`${ymd(5)}T00:00:00.000Z`);
  const from = new Date(`${ymd(-1)}T00:00:00.000Z`);
  const obs = (contributorKey: string, trusted: boolean, over: Record<string, unknown> = {}) => ({
    chain: 'biedronka',
    canonicalName: 'Masło Łaciate 200g',
    promoPrice: '4.99',
    currencyCode: 'PLN',
    condition: null,
    validFrom: from,
    validTo: to,
    contributorKey,
    trusted,
    isAdmin: false,
    adminLeafletId: null,
    ...over,
  });

  it('returns only promos that clear K and minTrusted, reading only validTo >= today', async () => {
    const { service, prisma } = build();
    prisma.communityPromoObservation.findMany.mockResolvedValue([
      obs('a', true),
      obs('b', true),
      obs('c', false, { condition: 'z aplikacją' }),
      obs('a', true, { canonicalName: 'Kawa 1kg' }),
      obs('b', false, { canonicalName: 'Kawa 1kg' }),
      obs('c', false, { canonicalName: 'Kawa 1kg' }),
    ]);
    const res = await service.confirmedActive(now);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      key: promoKey({ chain: 'biedronka', canonicalName: 'Masło Łaciate 200g', promoPrice: 4.99, currencyCode: 'PLN', validFrom: from, validTo: to }),
      chain: 'biedronka',
      canonicalName: 'Masło Łaciate 200g',
      promoPrice: 4.99,
      currencyCode: 'PLN',
      condition: null,
      validFrom: ymd(-1),
      validTo: ymd(5),
    });
    const where = prisma.communityPromoObservation.findMany.mock.calls[0][0].where;
    expect(where.validTo.gte).toEqual(new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`));
  });

  it('honours COMMUNITY_PROMO_K and COMMUNITY_PROMO_MIN_TRUSTED', async () => {
    const { service, prisma } = build({ ...ON, COMMUNITY_PROMO_K: '2', COMMUNITY_PROMO_MIN_TRUSTED: '1' });
    prisma.communityPromoObservation.findMany.mockResolvedValue([obs('a', true), obs('b', false)]);
    await expect(service.confirmedActive(now)).resolves.toHaveLength(1);
  });

  it('an admin row confirms on its own, unless its leaflet was unpublished', async () => {
    const { service, prisma } = build();
    prisma.communityPromoObservation.findMany.mockResolvedValue([
      obs('adm', true, { isAdmin: true }),
      obs('adm', true, { isAdmin: true, canonicalName: 'Kawa 1kg', adminLeafletId: 'pub' }),
      obs('adm', true, { isAdmin: true, canonicalName: 'Ser 150g', adminLeafletId: 'gone' }),
    ]);
    prisma.leaflet.findMany.mockResolvedValue([
      { id: 'pub', unpublishedAt: null },
      { id: 'gone', unpublishedAt: new Date() },
    ]);
    const res = await service.confirmedActive(now);
    expect(res.map((r) => r.canonicalName).sort()).toEqual(['Kawa 1kg', 'Masło Łaciate 200g']);
    expect(prisma.leaflet.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(['gone', 'pub']);
  });

  it('a promo that has not started yet is not active', async () => {
    const { service, prisma } = build();
    const later = new Date(`${ymd(1)}T00:00:00.000Z`);
    prisma.communityPromoObservation.findMany.mockResolvedValue([obs('adm', true, { isAdmin: true, validFrom: later })]);
    await expect(service.confirmedActive(now)).resolves.toEqual([]);
  });

  it('the condition comes only from an admin or a trusted row, never a lone untrusted one', async () => {
    const { service, prisma } = build();
    prisma.communityPromoObservation.findMany.mockResolvedValue([
      obs('a', true),
      obs('b', true),
      obs('c', false, { condition: 'only with a 99 zł basket' }),
    ]);
    expect((await service.confirmedActive(now))[0].condition).toBeNull();

    prisma.communityPromoObservation.findMany.mockResolvedValue([
      obs('a', true),
      obs('b', true, { condition: 'z aplikacją' }),
      obs('c', false, { condition: 'only with a 99 zł basket' }),
    ]);
    expect((await service.confirmedActive(now))[0].condition).toBe('z aplikacją');
  });

  it('never returns the contributor key', async () => {
    const { service, prisma } = build();
    prisma.communityPromoObservation.findMany.mockResolvedValue([obs('adm', true, { isAdmin: true })]);
    const res = await service.confirmedActive(now);
    expect(JSON.stringify(res)).not.toContain('adm');
  });
});
