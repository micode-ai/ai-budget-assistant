import { CommunityPriceService } from './community-price.service';
import { computeContributorKey, mondayOfWeek } from './community-price.util';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => overrides[key]) } as any;
}

function makeCache(getResult: any = null) {
  return {
    get: jest.fn().mockResolvedValue(getResult),
    set: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeGeocoding(city: string | null = 'Warszawa') {
  return { reverseGeocode: jest.fn().mockResolvedValue(city) } as any;
}

const SALT = 'test-salt';

describe('CommunityPriceService', () => {
  describe('env helpers', () => {
    it('getK falls back to the default when unset or below the min of 2', () => {
      const svc = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect((svc as any).getK()).toBe(5); // DEFAULT_K_ANONYMITY
    });

    it('getK honors a valid override', () => {
      const svc = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_PRICE_K: '8' }),
        null as any,
        null as any,
      );
      expect((svc as any).getK()).toBe(8);
    });

    it('getK ignores an override below the k-anonymity floor of 2', () => {
      const svc = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_PRICE_K: '1' }),
        null as any,
        null as any,
      );
      expect((svc as any).getK()).toBe(5);
    });

    it('intEnv returns the fallback for an unset/invalid value and the override otherwise', () => {
      const svc = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_MIN_ACCOUNT_AGE_DAYS: '10' }),
        null as any,
        null as any,
      );
      expect((svc as any).intEnv('COMMUNITY_MIN_ACCOUNT_AGE_DAYS', 7)).toBe(10);
      expect((svc as any).intEnv('COMMUNITY_MIN_CONTRIBUTOR_EXPENSES', 15)).toBe(15);
      expect((svc as any).intEnv('COMMUNITY_ANYTHING', 3)).toBe(3);
    });

    it('readEnabled defaults to off and only turns on for the exact string "true"', () => {
      const off = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect((off as any).readEnabled()).toBe(false);

      const wrong = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'yes' }),
        null as any,
        null as any,
      );
      expect((wrong as any).readEnabled()).toBe(false);

      const on = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true' }),
        null as any,
        null as any,
      );
      expect((on as any).readEnabled()).toBe(true);
    });

    it('correlationEnabled defaults to off', () => {
      const svc = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect((svc as any).correlationEnabled()).toBe(false);

      const on = new CommunityPriceService(
        null as any,
        makeConfig({ COMMUNITY_CORRELATION_ENABLED: 'true' }),
        null as any,
        null as any,
      );
      expect((on as any).correlationEnabled()).toBe(true);
    });
  });

  describe('getCommunityPrices — read kill-switch + k-anonymity', () => {
    it('returns an empty result and never touches the DB when the read kill-switch is off', async () => {
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const cache = makeCache();
      const svc = new CommunityPriceService(prisma, makeConfig(), null as any, cache);

      const res = await svc.getCommunityPrices('Mleko', null, '1w');

      expect(res.stores).toEqual([]);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('returns an empty result for a blank product without touching the DB', async () => {
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true' }),
        null as any,
        makeCache(),
      );

      const res = await svc.getCommunityPrices('   ', null, '1w');

      expect(res.stores).toEqual([]);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('returns a cached response without querying the DB on a cache hit', async () => {
      const cached = { product: 'Mleko', region: null, currency: 'PLN', period: '1w', weekLabel: 'x', stores: [] };
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const cache = makeCache(cached);
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true' }),
        null as any,
        cache,
      );

      const res = await svc.getCommunityPrices('Mleko', null, '1w');

      expect(res).toBe(cached);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('aggregates and caches a fresh result once k-anonymity clears', async () => {
      const weekStart = mondayOfWeek(new Date());
      const rows = [
        { merchantNormalized: 'biedronka', price: 4, currencyCode: 'PLN', contributorKey: 'c1', weekStart },
        { merchantNormalized: 'biedronka', price: 4.2, currencyCode: 'PLN', contributorKey: 'c2', weekStart },
      ];
      const prisma: any = {
        communityPriceObservation: { findMany: jest.fn().mockResolvedValue(rows) },
      };
      const cache = makeCache(null);
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({
          COMMUNITY_PRICE_READ_ENABLED: 'true',
          COMMUNITY_PRICE_K: '2',
          COMMUNITY_MIN_PERSISTENCE_WEEKS: '1',
        }),
        null as any,
        cache,
      );

      const res = await svc.getCommunityPrices('Mleko', null, '1w');

      expect(res.currency).toBe('PLN');
      expect(res.stores).toHaveLength(1);
      expect(res.stores[0].merchantName).toBe('Biedronka');
      expect(res.stores[0].contributorCount).toBe(2);
      expect(cache.set).toHaveBeenCalledWith(expect.any(String), res, 300);
    });

    it('drops a store below the k-anonymity threshold', async () => {
      const weekStart = mondayOfWeek(new Date());
      const rows = [{ merchantNormalized: 'biedronka', price: 4, currencyCode: 'PLN', contributorKey: 'c1', weekStart }];
      const prisma: any = { communityPriceObservation: { findMany: jest.fn().mockResolvedValue(rows) } };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({
          COMMUNITY_PRICE_READ_ENABLED: 'true',
          COMMUNITY_PRICE_K: '2',
          COMMUNITY_MIN_PERSISTENCE_WEEKS: '1',
        }),
        null as any,
        makeCache(null),
      );

      const res = await svc.getCommunityPrices('Mleko', null, '1w');

      expect(res.stores).toEqual([]);
    });
  });

  describe('searchProducts — read kill-switch + k-anonymity', () => {
    it('returns [] for a too-short query without touching the DB', async () => {
      const prisma: any = { communityPriceObservation: { groupBy: jest.fn() } };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true' }),
        null as any,
        null as any,
      );

      expect(await svc.searchProducts('m')).toEqual([]);
      expect(prisma.communityPriceObservation.groupBy).not.toHaveBeenCalled();
    });

    it('returns [] when the read kill-switch is off', async () => {
      const prisma: any = { communityPriceObservation: { groupBy: jest.fn() } };
      const svc = new CommunityPriceService(prisma, makeConfig(), null as any, null as any);

      expect(await svc.searchProducts('mleko')).toEqual([]);
      expect(prisma.communityPriceObservation.groupBy).not.toHaveBeenCalled();
    });

    it('only returns products that clear the k-anonymity gate in at least one region', async () => {
      const prisma: any = {
        communityPriceObservation: {
          groupBy: jest.fn().mockResolvedValue([
            { canonicalName: 'Mleko', region: 'warszawa', contributorKey: 'c1' },
            { canonicalName: 'Mleko', region: 'warszawa', contributorKey: 'c2' },
            { canonicalName: 'Chleb', region: 'krakow', contributorKey: 'c3' },
          ]),
        },
      };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true', COMMUNITY_PRICE_K: '2' }),
        null as any,
        null as any,
      );

      const res = await svc.searchProducts('mle');

      expect(res).toEqual([{ canonicalName: 'Mleko', regionsAvailable: 1 }]);
    });
  });

  describe('getCommunityMap — read kill-switch + k-anonymity', () => {
    it('returns [] when the read kill-switch is off', async () => {
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const svc = new CommunityPriceService(prisma, makeConfig(), null as any, makeCache());

      expect(await svc.getCommunityMap('Mleko', null, '1w')).toEqual([]);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('returns a cached response without querying the DB on a cache hit', async () => {
      const cached = [{ merchantName: 'Biedronka' }];
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'true' }),
        null as any,
        makeCache(cached),
      );

      expect(await svc.getCommunityMap('Mleko', null, '1w')).toBe(cached);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('returns only points with a known store coordinate, marking the cheapest', async () => {
      const weekStart = mondayOfWeek(new Date());
      const rows = [
        { merchantNormalized: 'biedronka', region: 'warszawa', price: 5, currencyCode: 'PLN', contributorKey: 'c1', weekStart },
        { merchantNormalized: 'biedronka', region: 'warszawa', price: 5.2, currencyCode: 'PLN', contributorKey: 'c2', weekStart },
        { merchantNormalized: 'lidl', region: 'warszawa', price: 4, currencyCode: 'PLN', contributorKey: 'c3', weekStart },
        { merchantNormalized: 'lidl', region: 'warszawa', price: 4.1, currencyCode: 'PLN', contributorKey: 'c4', weekStart },
      ];
      const prisma: any = {
        communityPriceObservation: { findMany: jest.fn().mockResolvedValue(rows) },
        communityStoreGeo: {
          // Only Biedronka has a known coordinate — Lidl clears k-anonymity but has no geo row.
          findMany: jest.fn().mockResolvedValue([{ merchantNormalized: 'biedronka', region: 'warszawa', lat: 52.23, lng: 21.01 }]),
        },
      };
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({
          COMMUNITY_PRICE_READ_ENABLED: 'true',
          COMMUNITY_PRICE_K: '2',
          COMMUNITY_MIN_PERSISTENCE_WEEKS: '1',
        }),
        null as any,
        makeCache(null),
      );

      const res = await svc.getCommunityMap('Mleko', null, '1w');

      expect(res).toHaveLength(1);
      expect(res[0].merchantName).toBe('Biedronka');
      expect(res[0].isCheapest).toBe(true);
    });
  });

  describe('recordContribution — write-path gating', () => {
    const baseExpense = () => ({
      merchant: 'BIEDRONKA 123',
      currencyCode: 'PLN',
      date: new Date('2026-07-01'),
      source: 'ocr',
      locationLat: 52.23,
      locationLng: 21.01,
      account: { encryptionEnabled: false, createdAt: new Date(Date.now() - 30 * 86_400_000) },
      items: [{ canonicalName: 'Mleko', quantity: 1, unitPrice: 3.5, totalPrice: 3.5 }],
    });

    function makePrisma(overrides: any = {}) {
      return {
        user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: true }) },
        expense: {
          findFirst: jest.fn().mockResolvedValue(baseExpense()),
          count: jest.fn().mockResolvedValue(20),
        },
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        communityPriceObservation: { upsert: jest.fn().mockResolvedValue(undefined) },
        communityStoreGeo: { upsert: jest.fn().mockResolvedValue(undefined) },
        ...overrides,
      };
    }

    it('skips silently when COMMUNITY_PRICE_SALT is not configured', async () => {
      const prisma: any = makePrisma();
      const svc = new CommunityPriceService(prisma, makeConfig(), makeGeocoding(), null as any);

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('skips when the user has not opted into contributing', async () => {
      const prisma: any = makePrisma({
        user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: false }) },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.expense.findFirst).not.toHaveBeenCalled();
      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('skips E2EE accounts (encrypted merchant/canonicalName cannot be aggregated)', async () => {
      const prisma: any = makePrisma({
        expense: {
          findFirst: jest.fn().mockResolvedValue({ ...baseExpense(), account: { encryptionEnabled: true, createdAt: new Date() } }),
          count: jest.fn(),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('skips an expense with no POS coordinates', async () => {
      const prisma: any = makePrisma({
        expense: {
          findFirst: jest.fn().mockResolvedValue({ ...baseExpense(), locationLat: null, locationLng: null }),
          count: jest.fn(),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('skips an expense with an empty merchant', async () => {
      const prisma: any = makePrisma({
        expense: {
          findFirst: jest.fn().mockResolvedValue({ ...baseExpense(), merchant: null }),
          count: jest.fn(),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('skips a non-receipt-scanned expense (manual/import source)', async () => {
      const prisma: any = makePrisma({
        expense: {
          findFirst: jest.fn().mockResolvedValue({ ...baseExpense(), source: 'manual' }),
          count: jest.fn(),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('skips an ineligible (too new / too little history) account', async () => {
      const prisma: any = makePrisma({
        expense: {
          findFirst: jest.fn().mockResolvedValue({ ...baseExpense(), account: { encryptionEnabled: false, createdAt: new Date() } }),
          count: jest.fn().mockResolvedValue(1),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
    });

    it('never throws when a lookup fails mid-way (fail-silent)', async () => {
      const prisma: any = makePrisma({
        expense: { findFirst: jest.fn().mockRejectedValue(new Error('db down')), count: jest.fn() },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await expect(svc.recordContribution('acc-1', 'user-1', 'exp-1')).resolves.toBeUndefined();
    });

    it('writes the expected contributor key + dedup key when every gate passes', async () => {
      const prisma: any = makePrisma();
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding('Warszawa'),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      expect(prisma.communityPriceObservation.upsert).toHaveBeenCalledTimes(1);
      const call = prisma.communityPriceObservation.upsert.mock.calls[0][0];
      expect(call.where.community_obs_dedup).toEqual({
        canonicalName: 'Mleko',
        merchantNormalized: 'biedronka',
        region: 'warszawa',
        weekStart: mondayOfWeek(new Date('2026-07-01')),
        currencyCode: 'PLN',
        contributorKey: computeContributorKey(SALT, 'acc-1'),
      });
      expect(call.create.price).toBe(3.5);

      // Fire-and-forget store-geo upsert for the map feature.
      expect(prisma.communityStoreGeo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { community_store_geo_key: { merchantNormalized: 'biedronka', region: 'warszawa' } },
        }),
      );
    });

    it('tolerates a concurrent duplicate-key race on the observation upsert and still writes the next item', async () => {
      const twoItemExpense = {
        ...baseExpense(),
        items: [
          { canonicalName: 'Mleko', quantity: 1, unitPrice: 3.5, totalPrice: 3.5 },
          { canonicalName: 'Chleb', quantity: 1, unitPrice: 5, totalPrice: 5 },
        ],
      };
      const upsert = jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce(undefined);
      const prisma: any = makePrisma({
        expense: { findFirst: jest.fn().mockResolvedValue(twoItemExpense), count: jest.fn().mockResolvedValue(20) },
        communityPriceObservation: { upsert },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await expect(svc.recordContribution('acc-1', 'user-1', 'exp-1')).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledTimes(2);
    });

    it('respects a user-defined product alias, including the __ignored__ sentinel', async () => {
      const twoItemExpense = {
        ...baseExpense(),
        items: [
          { canonicalName: 'Mleko 1L', quantity: 1, unitPrice: 3.5, totalPrice: 3.5 },
          { canonicalName: 'Torba', quantity: 1, unitPrice: 0.5, totalPrice: 0.5 },
        ],
      };
      const prisma: any = makePrisma({
        expense: { findFirst: jest.fn().mockResolvedValue(twoItemExpense), count: jest.fn().mockResolvedValue(20) },
        productAlias: {
          findMany: jest.fn().mockResolvedValue([
            { rawName: 'Mleko 1L', canonicalName: 'Mleko' },
            { rawName: 'Torba', canonicalName: '__ignored__' },
          ]),
        },
      });
      const svc = new CommunityPriceService(
        prisma,
        makeConfig({ COMMUNITY_PRICE_SALT: SALT }),
        makeGeocoding(),
        null as any,
      );

      await svc.recordContribution('acc-1', 'user-1', 'exp-1');

      // Only the aliased, non-ignored item is written.
      expect(prisma.communityPriceObservation.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.communityPriceObservation.upsert.mock.calls[0][0].create.canonicalName).toBe('Mleko');
    });
  });
});
