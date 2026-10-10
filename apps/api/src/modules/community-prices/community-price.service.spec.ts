import { CommunityPriceService } from './community-price.service';
import { computeContributorKey, mondayOfWeek } from './community-price.util';
import { attestedLineHash, signScanAttestation, type ScanAttestationPayload } from './scan-attestation.util';

const SALT = 'test-salt-test-salt-test-salt-test-salt'; // >= 32 chars (ABA-642 audit)
const DAY = 86_400_000;

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => overrides[key]) } as any;
}

function makeCache(getResult: any = null) {
  return {
    get: jest.fn().mockResolvedValue(getResult),
    set: jest.fn().mockResolvedValue(undefined),
    incrementWindow: jest.fn().mockResolvedValue(1),
  } as any;
}

function makeGeocoding(city: string | null = 'Warszawa') {
  return { reverseGeocode: jest.fn().mockResolvedValue(city) } as any;
}

// Reads require correlation clustering since the ABA-642 audit.
const READ_ON = { COMMUNITY_PRICE_READ_ENABLED: 'true', COMMUNITY_CORRELATION_ENABLED: 'true' };
const READ_FLAG_ONLY = { COMMUNITY_PRICE_READ_ENABLED: 'true' };
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

describe('CommunityPriceService', () => {
  describe('env helpers', () => {
    it('getK falls back to the default when unset or below the min of 2', () => {
      const svc = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect((svc as any).getK()).toBe(5);
      const low = new CommunityPriceService(null as any, makeConfig({ COMMUNITY_PRICE_K: '1' }), null as any, null as any);
      expect((low as any).getK()).toBe(5);
    });

    it('getK honors a valid override', () => {
      const svc = new CommunityPriceService(null as any, makeConfig({ COMMUNITY_PRICE_K: '8' }), null as any, null as any);
      expect((svc as any).getK()).toBe(8);
    });

    it('readEnabled defaults to off and only turns on for the exact string "true"', () => {
      const off = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect(off.readEnabled()).toBe(false);
      const wrong = new CommunityPriceService(null as any, makeConfig({ COMMUNITY_PRICE_READ_ENABLED: 'yes' }), null as any, null as any);
      expect(wrong.readEnabled()).toBe(false);
      const on = new CommunityPriceService(null as any, makeConfig(READ_ON), null as any, null as any);
      expect(on.readEnabled()).toBe(true);
    });

    it('ABA-642 audit: reads REQUIRE correlation: the flag alone is refused and warns loudly at startup', () => {
      const flagOnly = new CommunityPriceService(null as any, makeConfig(READ_FLAG_ONLY), null as any, null as any);
      expect(flagOnly.readEnabled()).toBe(false);
      const logger = { warn: jest.fn() };
      (flagOnly as any).logger = logger;
      flagOnly.onModuleInit();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('COMMUNITY_CORRELATION_ENABLED'));

      const both = new CommunityPriceService(null as any, makeConfig(READ_ON), null as any, null as any);
      (both as any).logger = { warn: jest.fn() };
      both.onModuleInit();
      expect(both.readEnabled()).toBe(true);
      expect((both as any).logger.warn).not.toHaveBeenCalled();
    });

    it('ABA-642 audit: with the flag on but correlation off every read returns the "not enough data" shape', async () => {
      const findMany = jest.fn();
      const prisma: any = { communityPriceObservation: { findMany, groupBy: findMany } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_FLAG_ONLY), makeGeocoding(), makeCache());
      expect((await svc.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);
      expect(await svc.getCommunityMap('Mleko 1L', null, '4w')).toEqual([]);
      expect(await svc.searchProducts('mleko')).toEqual([]);
      expect(await svc.getStoreBaselines('u1', ['Mleko 1L'], 'biedronka', 52.2, 21.0, 'PLN')).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('correlationEnabled defaults to off', () => {
      const svc = new CommunityPriceService(null as any, makeConfig(), null as any, null as any);
      expect((svc as any).correlationEnabled()).toBe(false);
      const on = new CommunityPriceService(null as any, makeConfig({ COMMUNITY_CORRELATION_ENABLED: 'true' }), null as any, null as any);
      expect((on as any).correlationEnabled()).toBe(true);
    });
  });

  // ── Read path ──────────────────────────────────────────────────────────────

  /** A prisma mock whose findMany honours `where.attested`, like the real table would. */
  function tableFindMany(table: any[]) {
    return jest.fn().mockImplementation(async (args: any) => {
      const w = args?.where ?? {};
      return table.filter((r) => (w.attested === undefined ? true : r.attested === w.attested));
    });
  }

  const thisWeek = () => mondayOfWeek(new Date());
  const weeksAgo = (n: number) => {
    const d = mondayOfWeek(new Date());
    d.setDate(d.getDate() - n * 7);
    return d;
  };

  /** Five distinct, trusted contributors at one store; c0 also posted last week (persistence). */
  function fiveContributors(over: Record<string, any> = {}) {
    const mk = (key: string, price: number, weekStart: Date, extra: any = {}) => ({
      canonicalName: 'Mleko 1L',
      merchantNormalized: 'biedronka',
      region: 'warszawa',
      price,
      currencyCode: 'PLN',
      contributorKey: key,
      weekStart,
      ingestWeek: weekStart,
      trusted: true,
      attested: true,
      ...over,
      ...extra,
    });
    return [
      mk('c0', 3.0, thisWeek()),
      mk('c1', 3.1, thisWeek()),
      mk('c2', 3.2, thisWeek()),
      mk('c3', 3.3, thisWeek()),
      mk('c4', 3.4, thisWeek()),
      mk('c0', 3.0, weeksAgo(1)),
    ];
  }

  describe('getCommunityPrices', () => {
    it('returns empty and never touches the DB or the cache when the read kill-switch is off', async () => {
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const cache = makeCache();
      const svc = new CommunityPriceService(prisma, makeConfig(), null as any, cache);
      const res = await svc.getCommunityPrices('Mleko', null, '4w');
      expect(res.stores).toEqual([]);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('returns empty for a blank product without touching the DB', async () => {
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect((await svc.getCommunityPrices('   ', null, '4w')).stores).toEqual([]);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('returns a cached response without querying the DB', async () => {
      const cached = { product: 'Mleko', stores: [{ merchantName: 'X' }] };
      const prisma: any = { communityPriceObservation: { findMany: jest.fn() } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache(cached));
      expect(await svc.getCommunityPrices('Mleko', null, '4w')).toBe(cached);
      expect(prisma.communityPriceObservation.findMany).not.toHaveBeenCalled();
    });

    it('exposes a store once every gate clears, caches it, and never leaks contributor data', async () => {
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(fiveContributors()) } };
      const cache = makeCache();
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, cache);

      const res = await svc.getCommunityPrices('Mleko 1L', null, '4w');

      expect(res.stores).toHaveLength(1);
      expect(res.stores[0]).toEqual({
        merchantName: 'Biedronka',
        medianPrice: 3.2,
        receiptCount: 5, // exact 6, published as a bucket
        contributorCount: 5,
        currencyCode: 'PLN',
        isCheapest: true,
      });
      expect(cache.set).toHaveBeenCalledWith(expect.any(String), res, 300);

      // Egress: the whole response, serialized, carries no per-row or identity fields.
      const json = JSON.stringify(res);
      for (const forbidden of ['contributorKey', 'trusted', 'weekStart', 'minPrice', 'c0', 'attested']) {
        expect(json).not.toContain(forbidden);
      }
      expect(Object.keys(res).sort()).toEqual(['currency', 'period', 'product', 'region', 'stores', 'weekLabel']);
    });

    it('ABA-642 audit: the published receiptCount is a bucket, never the exact figure, and a product over 64 chars is empty', async () => {
      const rows = fiveContributors().concat(
        // c1 posts 9 more times this week: its weight is capped, and the total is bucketed anyway
        Array.from({ length: 9 }, () => fiveContributors()[1]),
      );
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany: tableFindMany(rows) } } as any, makeConfig(READ_ON), null as any, makeCache());
      const res = await svc.getCommunityPrices('Mleko 1L', null, '4w');
      expect([5, 10, 20, 50]).toContain(res.stores[0].receiptCount);
      expect(res.stores[0].receiptCount).toBe(5); // 6 rows -> capped sum 8 -> bucket 5, never 15
      const long = new CommunityPriceService({ communityPriceObservation: { findMany: jest.fn() } } as any, makeConfig(READ_ON), null as any, makeCache());
      expect((await long.getCommunityPrices('x'.repeat(65), null, '4w')).stores).toEqual([]);
    });

    it('ABA-642 audit: a single week of INGESTION is not persistence even when the receipts are back-dated', async () => {
      // two receipt weeks, but everything was ingested in the same week
      const rows = fiveContributors().map((r) => ({ ...r, ingestWeek: thisWeek() }));
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(rows) } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect((await svc.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);
    });

    it('only ever queries attested rows, and LEGACY rows are never aggregated', async () => {
      // Five would-be contributors, all pre-ABA-642 (attested = false): never shown.
      const legacy = fiveContributors({ attested: false });
      const findMany = tableFindMany(legacy);
      const prisma: any = { communityPriceObservation: { findMany } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());

      const res = await svc.getCommunityPrices('Mleko 1L', null, '4w');

      expect(findMany.mock.calls[0][0].where.attested).toBe(true);
      expect(res.stores).toEqual([]);
    });

    it('a store with 5 lookback contributors but ONE in the displayed week is not exposed (hole 2)', async () => {
      const rows = fiveContributors().map((r, i) => ({
        ...r,
        weekStart: i === 4 ? thisWeek() : weeksAgo(2), // 4 old rows, 1 current
      }));
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(rows) } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect((await svc.getCommunityPrices('Mleko 1L', null, '1w')).stores).toEqual([]);
    });

    it('one account cannot set a price: a lone fake low among 4 honest clusters exposes nothing', async () => {
      const rows = fiveContributors().map((r) => (r.contributorKey === 'c4' ? { ...r, price: 0.4 } : r));
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(rows) } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect((await svc.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);
    });

    it('five untrusted (fresh) contributors are not exposed; two trusted among them are', async () => {
      const fresh = fiveContributors({ trusted: false });
      const svc1 = new CommunityPriceService(
        { communityPriceObservation: { findMany: tableFindMany(fresh) } } as any,
        makeConfig(READ_ON),
        null as any,
        makeCache(),
      );
      expect((await svc1.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);

      const mixed = fresh.map((r) => (['c0', 'c1'].includes(r.contributorKey) ? { ...r, trusted: true } : r));
      const svc2 = new CommunityPriceService(
        { communityPriceObservation: { findMany: tableFindMany(mixed) } } as any,
        makeConfig(READ_ON),
        null as any,
        makeCache(),
      );
      expect((await svc2.getCommunityPrices('Mleko 1L', null, '4w')).stores).toHaveLength(1);
    });

    it('the persistence gate still applies (one week of data is not exposed)', async () => {
      const rows = fiveContributors().filter((r) => r.weekStart.getTime() === thisWeek().getTime());
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(rows) } };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect((await svc.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);
    });

    it('is correlation-aware: rows of one clustered ring count as one contributor', async () => {
      const rows = fiveContributors();
      const prisma: any = { communityPriceObservation: { findMany: tableFindMany(rows) } };
      const svc = new CommunityPriceService(prisma, makeConfig({ ...READ_ON, COMMUNITY_CORRELATION_ENABLED: 'true' }), null as any, makeCache());
      // Force a cluster map where c1..c4 are one ring.
      jest.spyOn(svc as any, 'buildClusterMap').mockResolvedValue(
        new Map([
          ['c1', 'ring'],
          ['c2', 'ring'],
          ['c3', 'ring'],
          ['c4', 'ring'],
        ]),
      );
      expect((await svc.getCommunityPrices('Mleko 1L', null, '4w')).stores).toEqual([]);
    });
  });

  describe('searchProducts', () => {
    function groups(over: any[]) {
      return jest.fn().mockResolvedValue(over);
    }
    const g = (canonicalName: string, region: string, contributorKey: string, trusted: boolean) => ({
      canonicalName,
      region,
      contributorKey,
      trusted,
    });

    it('returns [] for a too-short query or with the kill-switch off, without touching the DB', async () => {
      const prisma: any = { communityPriceObservation: { groupBy: jest.fn() } };
      expect(await new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache()).searchProducts('m')).toEqual([]);
      expect(await new CommunityPriceService(prisma, makeConfig(), null as any, makeCache()).searchProducts('mleko')).toEqual([]);
      expect(prisma.communityPriceObservation.groupBy).not.toHaveBeenCalled();
    });

    it('ABA-642 audit: caps the term at 64 chars and caches results (global key, 5 min)', async () => {
      const groupBy = groups([g('Mleko 1L', 'warszawa', 'a', true)]);
      const cache = makeCache();
      const svc = new CommunityPriceService({ communityPriceObservation: { groupBy } } as any, makeConfig(READ_ON), null as any, cache);
      expect(await svc.searchProducts('x'.repeat(65))).toEqual([]);
      expect(groupBy).not.toHaveBeenCalled();
      await svc.searchProducts('Mleko');
      expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^cphs:[0-9a-f]{40}$/), expect.any(Array), 300);
      const hit = new CommunityPriceService({ communityPriceObservation: { groupBy } } as any, makeConfig(READ_ON), null as any, makeCache([{ canonicalName: 'cached', regionsAvailable: 1 }]));
      expect(await hit.searchProducts('mleko')).toEqual([{ canonicalName: 'cached', regionsAvailable: 1 }]);
      expect(groupBy).toHaveBeenCalledTimes(1);
    });

    it('limits itself to attested rows inside the lookback and groups by trusted', async () => {
      const groupBy = groups([]);
      const svc = new CommunityPriceService({ communityPriceObservation: { groupBy } } as any, makeConfig(READ_ON), null as any, makeCache());
      await svc.searchProducts('mleko');
      const arg = groupBy.mock.calls[0][0];
      expect(arg.by).toEqual(['canonicalName', 'region', 'contributorKey', 'trusted']);
      expect(arg.where.attested).toBe(true);
      expect(arg.where.weekStart.gte).toBeInstanceOf(Date);
    });

    it('offers a product only when a region has >= K contributors, at least 2 of them trusted', async () => {
      const five = (name: string, trustedCount: number) =>
        ['a', 'b', 'c', 'd', 'e'].map((k, i) => g(name, 'warszawa', `${name}-${k}`, i < trustedCount));
      const groupBy = groups([
        ...five('Mleko trusted', 2),
        ...five('Mleko fresh ring', 0),
        ...five('Mleko one trusted', 1),
        g('Mleko tiny', 'warszawa', 'x', true),
      ]);
      const svc = new CommunityPriceService({ communityPriceObservation: { groupBy } } as any, makeConfig(READ_ON), null as any, makeCache());
      expect(await svc.searchProducts('mleko')).toEqual([{ canonicalName: 'Mleko trusted', regionsAvailable: 1 }]);
    });

    it('a contributor seen with both trusted values counts once, as trusted', async () => {
      const groupBy = groups([
        g('Chleb', 'krakow', 'k1', false),
        g('Chleb', 'krakow', 'k1', true),
        g('Chleb', 'krakow', 'k2', true),
        g('Chleb', 'krakow', 'k3', false),
        g('Chleb', 'krakow', 'k4', false),
        g('Chleb', 'krakow', 'k5', false),
      ]);
      const svc = new CommunityPriceService({ communityPriceObservation: { groupBy } } as any, makeConfig(READ_ON), null as any, makeCache());
      expect(await svc.searchProducts('chleb')).toEqual([{ canonicalName: 'Chleb', regionsAvailable: 1 }]);
    });
  });

  describe('getCommunityMap', () => {
    const geoRow = { merchantNormalized: 'biedronka', region: 'warszawa', lat: 52.2297, lng: 21.0122 };

    it('returns [] when the kill-switch is off', async () => {
      const svc = new CommunityPriceService(null as any, makeConfig(), null as any, makeCache());
      expect(await svc.getCommunityMap('Mleko 1L', null, '4w')).toEqual([]);
    });

    it('returns points only for cells with an ATTESTED pin, marking the cheapest', async () => {
      const findMany = tableFindMany(fiveContributors());
      const geoFindMany = jest.fn().mockResolvedValue([geoRow]);
      const prisma: any = {
        communityPriceObservation: { findMany },
        communityStoreGeo: { findMany: geoFindMany },
      };
      const cache = makeCache();
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, cache);

      const points = await svc.getCommunityMap('Mleko 1L', null, '4w');

      expect(geoFindMany.mock.calls[0][0].where.attested).toBe(true); // legacy pins never shown
      expect(points).toEqual([
        {
          merchantName: 'Biedronka',
          lat: 52.2297,
          lng: 21.0122,
          medianPrice: 3.2,
          currencyCode: 'PLN',
          receiptCount: 5, // exact 6, published as a bucket
          isCheapest: true,
        },
      ]);
      expect(JSON.stringify(points)).not.toMatch(/contributor|trusted|weekStart|minPrice/);
    });

    it('a cell without a pin is not on the map', async () => {
      const prisma: any = {
        communityPriceObservation: { findMany: tableFindMany(fiveContributors()) },
        communityStoreGeo: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new CommunityPriceService(prisma, makeConfig(READ_ON), null as any, makeCache());
      expect(await svc.getCommunityMap('Mleko 1L', null, '4w')).toEqual([]);
    });
  });

  describe('getStoreBaselines (receipt price check fallback)', () => {
    const baselineRows = () =>
      fiveContributors().map((r) => ({ ...r, canonicalName: 'Mleko 1L' })).concat(
        // a second product that does not clear the gate
        fiveContributors().slice(0, 2).map((r) => ({ ...r, canonicalName: 'Rzadki produkt', contributorKey: `z${r.contributorKey}` })),
      );

    it('returns [] with the read flag off and never queries', async () => {
      const findMany = jest.fn();
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(), makeGeocoding(), makeCache());
      expect(await svc.getStoreBaselines('u1', ['Mleko 1L'], 'biedronka', 52.2, 21.0, 'PLN')).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns a baseline only for gated cells of the same store, region and currency', async () => {
      const findMany = tableFindMany(baselineRows());
      const cache = makeCache();
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding('Warszawa'), cache);

      const out = await svc.getStoreBaselines('u1', ['Mleko 1L', 'Rzadki produkt'], 'biedronka', 52.23, 21.01, 'PLN');

      expect(out).toEqual([{ canonicalName: 'Mleko 1L', medianPrice: 3.2, currency: 'PLN' }]);
      const where = findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ attested: true, merchantNormalized: 'biedronka', region: 'warszawa', currencyCode: 'PLN' });
      expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^cpbase:[0-9a-f]{40}$/), expect.any(Array), 300);
    });

    it('ABA-642 audit: is budgeted per user and FAILS CLOSED (over budget or Redis down -> [])', async () => {
      const findMany = tableFindMany(baselineRows());
      const over = { ...makeCache(), incrementWindow: jest.fn().mockResolvedValue(31) };
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding(), over);
      expect(await svc.getStoreBaselines('u1', ['Mleko 1L'], 'biedronka', 52.2, 21.0, 'PLN')).toEqual([]);
      expect(over.incrementWindow).toHaveBeenCalledWith('cp:bl:u1', 3_600_000);
      expect(findMany).not.toHaveBeenCalled();

      const down = { ...makeCache(), incrementWindow: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
      const svc2 = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding(), down);
      (svc2 as any).logger = { warn: jest.fn() };
      expect(await svc2.getStoreBaselines('u1', ['Mleko 1L'], 'biedronka', 52.2, 21.0, 'PLN')).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('ABA-642 audit: orders the capped read deterministically and caps products per scan', async () => {
      const findMany = tableFindMany(baselineRows());
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding('Warszawa'), makeCache());
      const names = [...Array.from({ length: 150 }, (_, i) => `Produkt ${i}`)];
      names.push('Mleko 1L'); // 151st: beyond the 100-product cap, so never matched
      expect(await svc.getStoreBaselines('u1', names, 'biedronka', 52.23, 21.01, 'PLN')).toEqual([]);
      expect(findMany.mock.calls[0][0].orderBy).toEqual([{ weekStart: 'desc' }, { id: 'asc' }]);
      expect(findMany.mock.calls[0][0].take).toBe(20_000);
    });

    it('serves from the cpbase cache without querying', async () => {
      const findMany = jest.fn();
      const cache = makeCache([{ canonicalName: 'Mleko 1L', medianPrice: 3.2, currency: 'PLN' }]);
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding(), cache);
      expect(await svc.getStoreBaselines('u1', ['mleko 1l'], 'biedronka', 52.2, 21.0, 'PLN')).toHaveLength(1);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('is fail-silent: a DB error yields []', async () => {
      const findMany = jest.fn().mockRejectedValue(new Error('db down'));
      const svc = new CommunityPriceService({ communityPriceObservation: { findMany } } as any, makeConfig(READ_ON), makeGeocoding(), makeCache());
      (svc as any).logger = { warn: jest.fn() };
      expect(await svc.getStoreBaselines('u1', ['Mleko 1L'], 'biedronka', 52.2, 21.0, 'PLN')).toEqual([]);
    });
  });

  // ── Write path ─────────────────────────────────────────────────────────────

  describe('recordContribution', () => {
    const USER = 'user-1';
    const ACCOUNT = 'acc-1';
    const EXPENSE = 'exp-1';

    const LINES = [
      { canonicalName: 'Mleko 1L', quantity: 1, totalPrice: 3.5 },
      { canonicalName: 'Chleb', quantity: 2, totalPrice: 7 },
      { canonicalName: 'Masło', quantity: 1, totalPrice: 8.99 },
    ];

    function payload(over: Partial<ScanAttestationPayload> = {}): ScanAttestationPayload {
      return {
        v: 1,
        u: USER,
        a: ACCOUNT,
        iat: Date.now(),
        m: 'biedronka',
        c: 'PLN',
        d: isoDaysAgo(1),
        t: '12:30',
        tot: 1949,
        loc: [52.2297, 21.0122],
        h: LINES.map((l) => attestedLineHash(l.canonicalName, l.quantity, l.totalPrice)),
        ...over,
      };
    }
    const token = (over: Partial<ScanAttestationPayload> = {}, salt = SALT) => signScanAttestation(salt, payload(over));

    function makePrisma(over: any = {}) {
      return {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ contributeCommunityPrices: true, createdAt: new Date(Date.now() - 100 * DAY) }),
        },
        expense: {
          // The expense row deliberately carries DIFFERENT merchant/location/date/source than the
          // token: only the token may be believed.
          findFirst: jest.fn().mockResolvedValue({
            merchant: 'ATTACKER SHOP',
            locationLat: 10,
            locationLng: 10,
            source: 'manual',
            account: { encryptionEnabled: false },
            items: LINES.map((l) => ({ ...l, unitPrice: 999 })),
          }),
          count: jest.fn().mockResolvedValue(20),
        },
        subscription: { findUnique: jest.fn().mockResolvedValue(null) },
        productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        communityReceiptSeen: {
          create: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        },
        communityPriceObservation: { upsert: jest.fn().mockResolvedValue(undefined) },
        communityStorePinCandidate: {
          upsert: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
        },
        communityStoreGeo: { upsert: jest.fn().mockResolvedValue(undefined) },
        ...over,
      } as any;
    }

    function make(prismaOver: any = {}, cfg: Record<string, string> = {}, cache = makeCache()) {
      const prisma = makePrisma(prismaOver);
      const geocoding = makeGeocoding('Warszawa');
      const svc = new CommunityPriceService(prisma, makeConfig({ COMMUNITY_PRICE_SALT: SALT, ...cfg }), geocoding, cache);
      const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
      (svc as any).logger = logger;
      return { svc, prisma, cache, geocoding, logger };
    }

    const written = (prisma: any) => prisma.communityPriceObservation.upsert.mock.calls.map((c: any[]) => c[0]);

    describe('contributeRescannedReceipt (re-scan backfill)', () => {
      it('takes the lines from the fresh server OCR, not the saved rows, and reports the outcome', async () => {
        const { svc, prisma } = make({
          expense: {
            findFirst: jest.fn().mockResolvedValue({ account: { encryptionEnabled: false }, items: [] }),
            count: jest.fn().mockResolvedValue(20),
          },
        });
        await expect(svc.contributeRescannedReceipt(ACCOUNT, USER, EXPENSE, token(), LINES)).resolves.toBe('contributed');
        expect(written(prisma).map((w: any) => w.create.canonicalName)).toEqual(['Mleko 1L', 'Chleb', 'Masło']);
      });

      it('still drops a line that is not in the token, and still requires the saved expense', async () => {
        const { svc, prisma } = make();
        const extra = [...LINES, { canonicalName: 'Injected', quantity: 1, totalPrice: 0.01 }];
        await svc.contributeRescannedReceipt(ACCOUNT, USER, EXPENSE, token(), extra);
        expect(written(prisma).map((w: any) => w.create.canonicalName)).not.toContain('Injected');

        const gone = make({ expense: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn() } });
        await expect(gone.svc.contributeRescannedReceipt(ACCOUNT, USER, EXPENSE, token(), LINES)).resolves.toBe('no_expense');
      });

      it('keeps every gate: no consent and a too-old receipt are refused', async () => {
        const noConsent = make({
          user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: false, createdAt: new Date(0) }) },
        });
        await expect(noConsent.svc.contributeRescannedReceipt(ACCOUNT, USER, EXPENSE, token(), LINES)).resolves.toBe('no_consent');
        const { svc } = make();
        await expect(svc.contributeRescannedReceipt(ACCOUNT, USER, EXPENSE, token({ d: isoDaysAgo(20) }), LINES)).resolves.toBe('too_old');
      });
    });

    describe('attestation gate', () => {
      it('no token: nothing is read and nothing is written (a forged source:ocr expense contributes nothing)', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE);
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, undefined);
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, '');
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.expense.findFirst).not.toHaveBeenCalled();
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('expense.source is not consulted: a manual-source expense WITH a valid token contributes', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(written(prisma)).toHaveLength(3);
      });

      it('skips silently when COMMUNITY_PRICE_SALT is not configured', async () => {
        const prisma = makePrisma();
        const svc = new CommunityPriceService(prisma, makeConfig(), makeGeocoding(), makeCache());
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it.each([
        ['a tampered payload', () => token().replace(/^./, (c) => (c === 'e' ? 'f' : 'e'))],
        ['a token signed with another salt', () => token({}, 'other-salt')],
        ['a token issued to another user', () => token({ u: 'someone-else' })],
        ['a token issued in another account', () => token({ a: 'acc-other' })],
        ['an expired (25 h old) token', () => token({ iat: Date.now() - 25 * 3_600_000 })],
        ['garbage', () => 'not.a.token'],
      ])('ignores %s', async (_name, build) => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, build());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
        expect(prisma.communityReceiptSeen.create).not.toHaveBeenCalled();
      });

      it('skips a backdated receipt (older than 14 days) and a far-future one', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ d: isoDaysAgo(20) }));
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ d: isoDaysAgo(-5) }));
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('accepts a receipt 13 days old', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ d: isoDaysAgo(13) }));
        expect(prisma.communityPriceObservation.upsert).toHaveBeenCalled();
      });
    });

    describe('what is written', () => {
      it('writes only the attested lines: an edited line (changed price) is dropped', async () => {
        const { svc, prisma } = make({
          expense: {
            findFirst: jest.fn().mockResolvedValue({
              account: { encryptionEnabled: false },
              items: [
                { canonicalName: 'Mleko 1L', quantity: 1, totalPrice: 3.5 },
                { canonicalName: 'Chleb', quantity: 2, totalPrice: 1 }, // price edited -> hash differs
                { canonicalName: 'Złoty batonik', quantity: 1, totalPrice: 5 }, // added by the user
              ],
            }),
            count: jest.fn().mockResolvedValue(20),
          },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(written(prisma).map((w: any) => w.create.canonicalName)).toEqual(['Mleko 1L']);
      });

      it('a renamed canonicalName no longer matches the hash and is dropped', async () => {
        const { svc, prisma } = make({
          expense: {
            findFirst: jest.fn().mockResolvedValue({
              account: { encryptionEnabled: false },
              items: [{ canonicalName: 'Mleko UHT 1L', quantity: 1, totalPrice: 3.5 }],
            }),
            count: jest.fn().mockResolvedValue(20),
          },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('takes merchant, location, date and currency from the TOKEN, never the expense row', async () => {
        const { svc, prisma, geocoding } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ d: isoDaysAgo(2) }));

        const create = written(prisma)[0].create;
        expect(create.merchantNormalized).toBe('biedronka');
        expect(create.currencyCode).toBe('PLN');
        expect(create.region).toBe('warszawa');
        const expectedWeek = mondayOfWeek(new Date(`${isoDaysAgo(2)}T12:00:00`));
        expect(create.weekStart.getTime()).toBe(expectedWeek.getTime());
        expect(geocoding.reverseGeocode).toHaveBeenCalledWith(52.2297, 21.0122);
        expect(prisma.communityStorePinCandidate.upsert.mock.calls[0][0].create).toMatchObject({
          merchantNormalized: 'biedronka',
          region: 'warszawa',
          lat: 52.2297,
          lng: 21.0122,
        });
      });

      it('derives the price from the attested total/quantity, ignoring a doctored unitPrice', async () => {
        const { svc, prisma } = make(); // the mock rows carry unitPrice 999
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const prices = Object.fromEntries(written(prisma).map((w: any) => [w.create.canonicalName, w.create.price]));
        expect(prices).toEqual({ 'Mleko 1L': 3.5, Chleb: 3.5, Masło: 8.99 });
      });

      it('holds no account/user/expense identity in any row it writes', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const forbidden = /accountId|userId|expenseId|account_id|user_id|expense_id/;
        for (const w of written(prisma)) expect(Object.keys(w.create).join(',')).not.toMatch(forbidden);
        expect(Object.keys(prisma.communityReceiptSeen.create.mock.calls[0][0].data).sort()).toEqual(['contentKey', 'weekStart']);
        expect(Object.keys(prisma.communityStorePinCandidate.upsert.mock.calls[0][0].create).join(',')).not.toMatch(forbidden);
        // ...and the user/account ids do not appear anywhere in the written payloads.
        const dump = JSON.stringify([
          prisma.communityPriceObservation.upsert.mock.calls,
          prisma.communityReceiptSeen.create.mock.calls,
          prisma.communityStorePinCandidate.upsert.mock.calls,
        ]);
        expect(dump).not.toContain(USER);
        expect(dump).not.toContain(ACCOUNT);
      });

      it('marks written rows attested (legacy rows stay false)', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(written(prisma).every((w: any) => w.create.attested === true)).toBe(true);
      });
    });

    describe('contributor key (per person)', () => {
      it('is the same across two accounts of one user, and not derived from the account id', async () => {
        const a = make();
        await a.svc.recordContribution('acc-personal', USER, EXPENSE, token({ a: 'acc-personal' }));
        const b = make();
        await b.svc.recordContribution('acc-business', USER, EXPENSE, token({ a: 'acc-business' }));
        const c = make();
        await c.svc.recordContribution('acc-trip', USER, EXPENSE, token({ a: 'acc-trip' }));

        const keys = [a, b, c].map((h) => written(h.prisma)[0].create.contributorKey);
        expect(new Set(keys).size).toBe(1); // 3 accounts of one user = 1 contributor
        expect(keys[0]).toBe(computeContributorKey(SALT, USER));
        expect(keys[0]).not.toBe(computeContributorKey(SALT, 'acc-personal'));
      });

      it('differs between two different users', async () => {
        const a = make();
        await a.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const b = make();
        await b.svc.recordContribution(ACCOUNT, 'user-2', EXPENSE, token({ u: 'user-2' }));
        expect(written(a.prisma)[0].create.contributorKey).not.toBe(written(b.prisma)[0].create.contributorKey);
      });
    });

    describe('eligibility (per user, across accounts)', () => {
      it('skips when the user has not opted in', async () => {
        const { svc, prisma } = make({
          user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: false, createdAt: new Date(0) }) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('skips E2EE accounts', async () => {
        const { svc, prisma } = make({
          expense: {
            findFirst: jest.fn().mockResolvedValue({ account: { encryptionEnabled: true }, items: LINES }),
            count: jest.fn().mockResolvedValue(20),
          },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('skips a too-new user and a user with too little history, counting by userId across accounts', async () => {
        const young = make({
          user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: true, createdAt: new Date(Date.now() - 2 * DAY) }) },
        });
        await young.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(young.prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();

        const thin = make({ expense: { ...makePrisma().expense, count: jest.fn().mockResolvedValue(3) } });
        await thin.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(thin.prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
        // The history count is by USER (all accounts), not by account.
        expect(thin.prisma.expense.count).toHaveBeenCalledWith({ where: { userId: USER, isDeleted: false } });
      });
    });

    describe('trusted flag', () => {
      const trustedOf = (prisma: any) => written(prisma)[0].create.trusted;
      const youngUser = { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: true, createdAt: new Date(Date.now() - 10 * DAY) }) };

      it('true at 60 days of tenure', async () => {
        const h = make({
          user: { findUnique: jest.fn().mockResolvedValue({ contributeCommunityPrices: true, createdAt: new Date(Date.now() - 61 * DAY) }) },
        });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(trustedOf(h.prisma)).toBe(true);
      });

      it('false for a young, free user', async () => {
        const h = make({ user: youngUser });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(trustedOf(h.prisma)).toBe(false);
      });

      it('true for a young user who really pays through Stripe', async () => {
        const h = make({
          user: youngUser,
          subscription: {
            findUnique: jest.fn().mockResolvedValue({ tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_123' }),
          },
        });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(trustedOf(h.prisma)).toBe(true);
      });

      it('FALSE when the paid tier is comped (no Stripe subscription id)', async () => {
        const h = make({
          user: youngUser,
          subscription: { findUnique: jest.fn().mockResolvedValue({ tier: 'pro', status: 'active', stripeSubscriptionId: null }) },
        });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(trustedOf(h.prisma)).toBe(false);
      });

      it('false for a trialing subscription', async () => {
        const h = make({
          user: youngUser,
          subscription: { findUnique: jest.fn().mockResolvedValue({ tier: 'pro', status: 'trialing', stripeSubscriptionId: 'sub_1' }) },
        });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(trustedOf(h.prisma)).toBe(false);
      });
    });

    describe('one physical receipt, once', () => {
      it('a unique violation on the content key skips the WHOLE receipt', async () => {
        const { svc, prisma } = make({
          communityReceiptSeen: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
        expect(prisma.communityStorePinCandidate.upsert).not.toHaveBeenCalled();
      });

      it('ABA-642 audit: a duplicate receipt never spends the contributor rate-limit budget', async () => {
        const { svc, cache } = make({
          communityReceiptSeen: { create: jest.fn().mockRejectedValue({ code: 'P2002' }), delete: jest.fn() },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(cache.incrementWindow).not.toHaveBeenCalled();
      });

      it('the content key is identical for the same receipt from two different users', async () => {
        const a = make();
        await a.svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ iat: Date.now() - 5000 }));
        const b = make();
        await b.svc.recordContribution(ACCOUNT, 'user-2', EXPENSE, token({ u: 'user-2', iat: Date.now() }));
        const key = (h: any) => h.prisma.communityReceiptSeen.create.mock.calls[0][0].data.contentKey;
        expect(key(a)).toBe(key(b));
        expect(key(a)).toMatch(/^[0-9a-f]{64}$/);
      });

      it('inserts the content key BEFORE any observation write', async () => {
        const order: string[] = [];
        const { svc } = make({
          communityReceiptSeen: { create: jest.fn().mockImplementation(async () => void order.push('seen')) },
          communityPriceObservation: { upsert: jest.fn().mockImplementation(async () => void order.push('obs')) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(order[0]).toBe('seen');
        expect(order.slice(1).every((o) => o === 'obs')).toBe(true);
      });
    });

    describe('rate limits (fail closed)', () => {
      it('uses per-contributor daily and weekly windows keyed by the hash only', async () => {
        const { svc, cache } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const key = computeContributorKey(SALT, USER);
        expect(cache.incrementWindow).toHaveBeenCalledWith(`cp:rl:d:${key}`, DAY);
        expect(cache.incrementWindow).toHaveBeenCalledWith(`cp:rl:w:${key}`, 7 * DAY);
      });

      it('allows the 6th receipt of the day and rejects the 7th', async () => {
        const sixth = make({}, {}, { ...makeCache(), incrementWindow: jest.fn().mockResolvedValue(6) });
        await sixth.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(sixth.prisma.communityPriceObservation.upsert).toHaveBeenCalled();

        const seventh = make({}, {}, { ...makeCache(), incrementWindow: jest.fn().mockResolvedValue(7) });
        await seventh.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(seventh.prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
        // the seen row is given back so an honest retry is not burned
        expect(seventh.prisma.communityReceiptSeen.delete).toHaveBeenCalled();
      });

      it('rejects the 21st receipt of the week', async () => {
        const incrementWindow = jest.fn().mockImplementation(async (k: string) => (k.startsWith('cp:rl:w:') ? 21 : 1));
        const h = make({}, {}, { ...makeCache(), incrementWindow });
        await h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(h.prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });

      it('FAILS CLOSED when Redis is down: the receipt is skipped and a warning logged', async () => {
        const h = make({}, {}, { ...makeCache(), incrementWindow: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
        await expect(h.svc.recordContribution(ACCOUNT, USER, EXPENSE, token())).resolves.toBeUndefined();
        expect(h.prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
        expect(h.prisma.communityReceiptSeen.delete).toHaveBeenCalled();
        expect(h.logger.warn).toHaveBeenCalledWith(expect.stringContaining('rate limiter unavailable'));
      });
    });

    describe('aliases', () => {
      it('never applies a user alias (user-typed text stays out of the shared corpus)', async () => {
        const { svc, prisma } = make({
          productAlias: { findMany: jest.fn().mockResolvedValue([]) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        // Only the __ignored__ sentinel is looked up, never the rename map.
        expect(prisma.productAlias.findMany).toHaveBeenCalledWith({
          where: { accountId: ACCOUNT, canonicalName: '__ignored__' },
          select: { rawName: true },
        });
        expect(written(prisma).map((w: any) => w.create.canonicalName)).toEqual(['Mleko 1L', 'Chleb', 'Masło']);
      });

      it('still honours the __ignored__ sentinel', async () => {
        const { svc, prisma } = make({
          productAlias: { findMany: jest.fn().mockResolvedValue([{ rawName: 'Chleb' }]) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(written(prisma).map((w: any) => w.create.canonicalName)).toEqual(['Mleko 1L', 'Masło']);
      });
    });

    describe('store pin (consensus, ABA-642 audit)', () => {
      it('the first writer publishes NOTHING: only a candidate is stored, never a pin', async () => {
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityStorePinCandidate.upsert).toHaveBeenCalledTimes(1);
        expect(prisma.communityStorePinCandidate.upsert.mock.calls[0][0].update).toEqual({}); // one vote, first kept
        expect(prisma.communityStoreGeo.upsert).not.toHaveBeenCalled();
      });

      it('below k distinct agreeing contributors still publishes nothing', async () => {
        const rows = ['a', 'b', 'c'].map((k) => ({ contributorKey: k, lat: 52.2297, lng: 21.0122 })); // 3 < k=5
        const { svc, prisma } = make({
          communityStorePinCandidate: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue(rows) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityStoreGeo.upsert).not.toHaveBeenCalled();
      });

      it('publishes the MEDIAN once k distinct contributors agree, on the attested row only', async () => {
        const rows = [0, 1, 2, 3, 4].map((i) => ({ contributorKey: `k${i}`, lat: 52.2297 + i * 0.0001, lng: 21.0122 }));
        const { svc, prisma } = make({
          communityStorePinCandidate: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue(rows) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const arg = prisma.communityStoreGeo.upsert.mock.calls[0][0];
        expect(arg.where.community_store_geo_key.attested).toBe(true);
        expect(arg.create).toMatchObject({ attested: true, lat: 52.2299, lng: 21.0122 });
      });

      it('a legacy (attested=false) pin is never targeted, so never overwritten', async () => {
        const rows = [0, 1, 2, 3, 4].map((i) => ({ contributorKey: `k${i}`, lat: 52.2297, lng: 21.0122 }));
        const { svc, prisma } = make({
          communityStorePinCandidate: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue(rows) },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        const keys = prisma.communityStoreGeo.upsert.mock.calls.map((c: any[]) => c[0].where.community_store_geo_key.attested);
        expect(keys).not.toContain(false);
      });

      it('a failing pin write never blocks the observation writes', async () => {
        const { svc, prisma } = make({
          communityStorePinCandidate: { upsert: jest.fn().mockRejectedValue(new Error('geo down')), findMany: jest.fn() },
        });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).toHaveBeenCalledTimes(3);
      });
    });

    describe('ABA-642 audit: ingest week, exact quantities, salt', () => {
      it('stamps ingestWeek (Monday of the token iat) on create and never on update', async () => {
        const iat = Date.now() - 3_600_000;
        const { svc, prisma } = make();
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ iat, d: isoDaysAgo(10) }));
        const call = written(prisma)[0];
        expect(call.create.ingestWeek.getTime()).toBe(mondayOfWeek(new Date(iat)).getTime());
        // the receipt week differs from the ingest week for a 10-day-old receipt
        expect(call.create.weekStart.getTime()).not.toBe(call.create.ingestWeek.getTime());
        expect(call.update.ingestWeek).toBeUndefined();
      });

      it('takes the unit price from exact integer thousandths (0.3334 kg quantised like Decimal(10,3))', async () => {
        const OCR = { canonicalName: 'Ser', quantity: 0.3334, totalPrice: 5 };
        const { svc, prisma } = make({
          expense: {
            findFirst: jest.fn().mockResolvedValue({
              account: { encryptionEnabled: false },
              items: [{ ...OCR, quantity: 0.333 }, { canonicalName: 'Mleko 1L', quantity: 1, totalPrice: 3.5 }],
            }),
            count: jest.fn().mockResolvedValue(20),
          },
        });
        const h = [attestedLineHash(OCR.canonicalName, OCR.quantity, OCR.totalPrice), attestedLineHash('Mleko 1L', 1, 3.5)];
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({ h }));
        const ser = written(prisma).find((w: any) => w.create.canonicalName === 'Ser');
        expect(ser.create.price).toBe(15.02); // 5.00 / 0.333, from integers
      });

      it('a salt shorter than 32 characters disables contributions and warns at startup', async () => {
        const prisma = makePrisma();
        const svc = new CommunityPriceService(prisma, makeConfig({ COMMUNITY_PRICE_SALT: 'short-salt' }), makeGeocoding(), makeCache());
        const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
        (svc as any).logger = logger;
        svc.onModuleInit();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('shorter than 32'));
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token({}, 'short-salt'));
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });
    });

    describe('robustness', () => {
      it('tolerates a concurrent duplicate-key race on an observation upsert and writes the next line', async () => {
        const upsert = jest.fn().mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValue(undefined);
        const { svc } = make({ communityPriceObservation: { upsert } });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(upsert).toHaveBeenCalledTimes(3);
      });

      it('never throws when a lookup fails mid-way (fail-silent)', async () => {
        const { svc } = make({ user: { findUnique: jest.fn().mockRejectedValue(new Error('db down')) } });
        await expect(svc.recordContribution(ACCOUNT, USER, EXPENSE, token())).resolves.toBeUndefined();
      });

      it('skips when the expense no longer exists', async () => {
        const { svc, prisma } = make({ expense: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn() } });
        await svc.recordContribution(ACCOUNT, USER, EXPENSE, token());
        expect(prisma.communityPriceObservation.upsert).not.toHaveBeenCalled();
      });
    });
  });
});
