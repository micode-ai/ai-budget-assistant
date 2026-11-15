import { HistoricalRateService, historicalRateCacheKey, lastDayOfMonth } from './historical-rate.service';

describe('HistoricalRateService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function make(cached: Record<string, unknown> = {}) {
    const cache: any = {
      get: jest.fn(async (k: string) => cached[k] ?? null),
      set: jest.fn(),
    };
    return { service: new HistoricalRateService(cache), cache };
  }

  it('asks for the last day of each month and adds EUR itself', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { PLN: 4.3, USD: 1.1 } }) }) as any;
    const { service, cache } = make();
    const res = await service.getMonthEndRates(['2026-02']);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/2026-02-28?base=EUR');
    expect(res).toEqual({ '2026-02': { PLN: 4.3, USD: 1.1, EUR: 1 } });
    expect(cache.set).toHaveBeenCalledWith(historicalRateCacheKey('2026-02'), res['2026-02'], expect.any(Number));
  });

  it('serves a cached month without calling the source', async () => {
    global.fetch = jest.fn() as any;
    const { service } = make({ [historicalRateCacheKey('2026-01')]: { EUR: 1, PLN: 4.2 } });
    expect(await service.getMonthEndRates(['2026-01'])).toEqual({ '2026-01': { EUR: 1, PLN: 4.2 } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('leaves out a month the source cannot answer, never throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    const { service } = make();
    expect(await service.getMonthEndRates(['2026-03'])).toEqual({});
  });

  it('computes the last day of a month, leap years included', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
});
