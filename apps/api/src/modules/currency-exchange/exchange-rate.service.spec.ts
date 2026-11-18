import { ExchangeRateService, fxRatesCacheKey } from './exchange-rate.service';

describe('ExchangeRateService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function make(stored: unknown = null) {
    const cache: any = { get: jest.fn(async () => stored), set: jest.fn() };
    return { service: new ExchangeRateService(cache), cache };
  }

  it('serves a fresh cached entry without fetching', async () => {
    global.fetch = jest.fn() as any;
    const { service } = make({ base: 'USD', rates: { PLN: 4 }, fetchedAt: Date.now() });
    const res = await service.getRates('USD');
    expect(res.rates).toEqual({ PLN: 4 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches on a miss, keeps only supported currencies and writes to Redis', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { PLN: 4, XYZ: 9 } }) }) as any;
    const { service, cache } = make();
    const res = await service.getRates('USD');
    expect(res.rates).toEqual({ PLN: 4 });
    expect(cache.set).toHaveBeenCalledWith(fxRatesCacheKey('USD'), expect.objectContaining({ base: 'USD', rates: { PLN: 4 } }), expect.any(Number));
  });

  it('refetches an expired entry', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { PLN: 5 } }) }) as any;
    const { service } = make({ base: 'USD', rates: { PLN: 4 }, fetchedAt: Date.now() - 2 * 3600 * 1000 });
    expect((await service.getRates('USD')).rates).toEqual({ PLN: 5 });
  });

  it('falls back to the stale entry when the fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    const { service } = make({ base: 'USD', rates: { PLN: 4 }, fetchedAt: Date.now() - 2 * 3600 * 1000 });
    expect((await service.getRates('USD')).rates).toEqual({ PLN: 4 });
  });

  it('throws when the fetch fails and nothing is cached', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    const { service } = make();
    await expect(service.getRates('USD')).rejects.toThrow();
  });
});
