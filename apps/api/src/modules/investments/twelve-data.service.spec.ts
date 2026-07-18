function makeConfigService(apiKey: string | undefined = 'test-api-key') {
  return { get: jest.fn().mockReturnValue(apiKey) } as any;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  };
}

// The service keeps its price/search cache and daily-request counter in
// module-level state, so each test needs a fresh module instance — otherwise
// a symbol used by an earlier test (e.g. 'AAPL') silently short-circuits on
// the cached result instead of exercising the fetch path under test.
function freshService(apiKey: string | undefined = 'test-api-key') {
  jest.resetModules();
  const { TwelveDataService } = require('./twelve-data.service');
  return new (TwelveDataService as any)(makeConfigService(apiKey));
}

describe('TwelveDataService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('searchAssets', () => {
    it('returns [] immediately when no API key is configured (never calls fetch)', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const service = freshService('');

      const result = await service.searchAssets('AAPL');

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns [] for a blank query without calling fetch', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const service = freshService();

      const result = await service.searchAssets('   ');

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps Twelve Data results and marks exactly one recommended result', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              symbol: 'AAPL',
              instrument_name: 'Apple Inc',
              exchange: 'NASDAQ',
              mic_code: 'XNAS',
              exchange_timezone: 'America/New_York',
              instrument_type: 'Common Stock',
              country: 'United States',
              currency: 'USD',
            },
            {
              symbol: 'AAPLX',
              instrument_name: 'Apple Something',
              exchange: 'OTC',
              mic_code: 'OTC',
              exchange_timezone: 'America/New_York',
              instrument_type: 'Common Stock',
              country: 'United States',
              currency: 'EUR',
            },
          ],
        }),
      ) as any;
      const service = freshService();

      const results = await service.searchAssets('AAPL');

      expect(results).toHaveLength(2);
      expect(results.filter((r: any) => r.isRecommended)).toHaveLength(1);
      // Exact symbol match + USD + NASDAQ priority should win over the OTC/EUR partial match
      expect(results.find((r: any) => r.isRecommended)?.symbol).toBe('AAPL');
    });

    it('returns [] when the API call throws (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
      const service = freshService();

      const results = await service.searchAssets('AAPL');

      expect(results).toEqual([]);
    });

    it('returns [] and does not throw when the API responds with a non-OK status (e.g. 429)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 429)) as any;
      const service = freshService();

      const results = await service.searchAssets('AAPL');

      expect(results).toEqual([]);
    });

    it('returns [] and does not throw when the response body is not valid JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      }) as any;
      const service = freshService();

      const results = await service.searchAssets('AAPL');

      expect(results).toEqual([]);
    });
  });

  describe('getCurrentPrice', () => {
    it('parses a valid Twelve Data price response', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ price: '123.45' })) as any;
      const service = freshService();

      const price = await service.getCurrentPrice('AAPL', 'NASDAQ');

      expect(price).toBe(123.45);
    });

    it('falls back to Yahoo Finance without throwing when Twelve Data responds 429', async () => {
      global.fetch = jest
        .fn()
        // Twelve Data /price call — rate limited
        .mockResolvedValueOnce(jsonResponse({}, false, 429))
        // Yahoo Finance fallback call
        .mockResolvedValueOnce(
          jsonResponse({
            chart: { result: [{ meta: { regularMarketPrice: 99.9 } }] },
          }),
        ) as any;
      const service = freshService();

      const price = await service.getCurrentPrice('AAPL');

      expect(price).toBe(99.9);
    });

    it('returns null (never throws) when both Twelve Data and Yahoo responses are malformed JSON', async () => {
      const malformed = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new SyntaxError('bad json')),
      };
      global.fetch = jest.fn().mockResolvedValue(malformed) as any;
      const service = freshService();

      await expect(service.getCurrentPrice('AAPL')).resolves.toBeNull();
    });

    it('goes straight to Yahoo Finance when no API key is configured', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse({ chart: { result: [{ meta: { regularMarketPrice: 50 } }] } }),
      ) as any;
      const service = freshService('');

      const price = await service.getCurrentPrice('AAPL');

      expect(price).toBe(50);
      expect(global.fetch).toHaveBeenCalledTimes(1); // only the Yahoo call
    });
  });

  describe('getBatchPrices', () => {
    it('returns an empty map without calling fetch when there is no API key', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const service = freshService('');

      const result = await service.getBatchPrices(['AAPL', 'MSFT']);

      expect(result.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('parses a multi-symbol batch response', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse({
          AAPL: { price: '150.00' },
          MSFT: { price: '300.00' },
        }),
      ) as any;
      const service = freshService();

      const result = await service.getBatchPrices(['AAPL', 'MSFT']);

      expect(result.get('AAPL')).toBe(150);
      expect(result.get('MSFT')).toBe(300);
    });

    it('does not throw when the batch endpoint returns malformed JSON, and still tries the Yahoo fallback', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.reject(new SyntaxError('bad json')),
        })
        .mockResolvedValue(jsonResponse({}, false, 404)) as any;
      const service = freshService();

      await expect(service.getBatchPrices(['AAPL'])).resolves.toBeInstanceOf(Map);
    });
  });

  describe('getTimeSeries', () => {
    it('parses Twelve Data time-series values into PricePoint[]', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse({
          values: [
            { datetime: '2026-01-02', open: '100', high: '110', low: '90', close: '105', volume: '1000' },
            { datetime: '2026-01-01', open: '95', high: '100', low: '90', close: '100', volume: '900' },
          ],
        }),
      ) as any;
      const service = freshService();

      const points = await service.getTimeSeries('AAPL', 30);

      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({ date: '2026-01-02', open: 100, high: 110, low: 90, close: 105, volume: 1000 });
    });

    it('falls back to Yahoo Finance without throwing when Twelve Data returns a rate-limit response', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, false, 429))
        .mockResolvedValueOnce(
          jsonResponse({
            chart: {
              result: [
                {
                  timestamp: [1735689600],
                  indicators: { quote: [{ open: [10], high: [12], low: [9], close: [11], volume: [500] }] },
                },
              ],
            },
          }),
        ) as any;
      const service = freshService();

      const points = await service.getTimeSeries('AAPL', 30);

      expect(points).toHaveLength(1);
      expect(points[0].close).toBe(11);
    });

    it('returns [] (never throws) when both providers fail with malformed JSON', async () => {
      const malformed = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new SyntaxError('bad json')),
      };
      global.fetch = jest.fn().mockResolvedValue(malformed) as any;
      const service = freshService();

      await expect(service.getTimeSeries('AAPL', 30)).resolves.toEqual([]);
    });
  });
});
