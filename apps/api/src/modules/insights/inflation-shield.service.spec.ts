import { InflationShieldService } from './inflation-shield.service';

describe('InflationShieldService', () => {
  // Monthly-ish cadence (>= 14d) + points in both forecast windows => stockpileable + rising.
  const risingProduct = {
    canonicalName: 'Masło',
    currency: 'PLN',
    points: [
      { date: '2026-05-25', price: 5.0 }, { date: '2026-06-08', price: 5.1 },
      { date: '2026-06-25', price: 5.7 }, { date: '2026-07-10', price: 5.9 },
    ],
    purchaseDates: [new Date('2026-05-25'), new Date('2026-06-08'), new Date('2026-06-25'), new Date('2026-07-10')],
    currentBestPrice: 5.9,
    latestMerchant: 'Lidl',
  };

  function make() {
    const priceHistory = { getProductTrends: jest.fn().mockResolvedValue([risingProduct]) };
    const exchange = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 1 } }) };
    const safeToSpend = { compute: jest.fn().mockResolvedValue({ projectedAvailable: 1000 }) };
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    const tracking = {
      recordRecommendations: jest.fn().mockResolvedValue(undefined),
      getActedRecommendations: jest.fn().mockResolvedValue([{ realizedSaving: 3, currencyCode: 'PLN' }]),
    };
    const svc = new InflationShieldService(
      priceHistory as any, exchange as any, safeToSpend as any, cache as any, tracking as any,
    );
    return { svc, priceHistory, cache, tracking };
  }

  it('returns ranked recommendations with a free response shape', async () => {
    const { svc } = make();
    const res = await svc.getShield('a1', 'u1', 'PLN', new Date('2026-07-15T00:00:00Z'));
    expect(res.baseCurrency).toBe('PLN');
    expect(res.hasEnoughData).toBe(true);
    expect(res.items[0].canonicalName).toBe('Masło');
    expect(res.items[0].store).toBe('Lidl');
    expect(res.items[0].affordableToday).toBe(true);
    expect(res.savedSoFar).toBe(3); // from make()'s tracking mock (one acted rec, same currency)
    expect(typeof res.computedAt).toBe('string');
  });

  it('serves from cache when present', async () => {
    const { svc, priceHistory, cache, tracking } = make();
    (cache.get as jest.Mock).mockResolvedValue({ baseCurrency: 'PLN', items: [], cached: true });
    const res: any = await svc.getShield('a1', 'u1', 'PLN');
    expect(res.cached).toBe(true);
    expect(priceHistory.getProductTrends).not.toHaveBeenCalled();
    expect(tracking.recordRecommendations).not.toHaveBeenCalled();
  });

  it('sums acted recommendations into savedSoFar and records surfaced recs', async () => {
    const { svc, tracking } = make();
    const res = await svc.getShield('a1', 'u1', 'PLN', new Date('2026-07-16T00:00:00Z'));
    expect(res.savedSoFar).toBe(3);
    expect(tracking.recordRecommendations).toHaveBeenCalled();
  });

  it('sets fxApproximate when an acted recommendation is converted into the display currency', async () => {
    const priceHistory = { getProductTrends: jest.fn().mockResolvedValue([]) }; // no items → assembled.fxApproximate false
    const exchange = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 4 } }) }; // 1 USD = 4 PLN
    const safeToSpend = { compute: jest.fn().mockResolvedValue({ projectedAvailable: 1000 }) };
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    const tracking = {
      recordRecommendations: jest.fn().mockResolvedValue(undefined),
      getActedRecommendations: jest.fn().mockResolvedValue([{ realizedSaving: 8, currencyCode: 'PLN' }]),
    };
    const svc = new InflationShieldService(priceHistory as any, exchange as any, safeToSpend as any, cache as any, tracking as any);
    const res = await svc.getShield('a1', 'u1', 'USD', new Date('2026-07-16T00:00:00Z'));
    expect(res.fxApproximate).toBe(true);
    expect(res.savedSoFar).toBeCloseTo(2, 5); // 8 PLN / 4 = 2 USD
  });
});
