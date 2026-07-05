import { GeocodingService, normalizeGeocodeQuery } from './geocoding.service';

describe('normalizeGeocodeQuery', () => {
  it('trims, collapses whitespace, lowercases', () => {
    expect(normalizeGeocodeQuery('  ul.  Marszałkowska 10,\n Warszawa ')).toBe(
      'ul. marszałkowska 10, warszawa',
    );
  });

  it('returns null for empty / null / too-short input', () => {
    expect(normalizeGeocodeQuery(null)).toBeNull();
    expect(normalizeGeocodeQuery(undefined)).toBeNull();
    expect(normalizeGeocodeQuery('   ')).toBeNull();
    expect(normalizeGeocodeQuery('ab')).toBeNull();
  });
});

describe('GeocodingService.geocode', () => {
  let prisma: {
    geocodeCache: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      geocodeCache: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    service = new GeocodingService(prisma as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('returns null for empty address without touching cache or network', async () => {
    expect(await service.geocode('  ')).toBeNull();
    expect(prisma.geocodeCache.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns cached coordinates without a network call', async () => {
    prisma.geocodeCache.findUnique.mockResolvedValue({
      lat: '52.2297', lng: '21.0122', displayName: 'Warszawa',
    });
    const result = await service.geocode('Marszałkowska 10, Warszawa');
    expect(result).toEqual({ lat: 52.2297, lng: 21.0122, displayName: 'Warszawa' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative cache hit (null lat) returns null without a network call', async () => {
    prisma.geocodeCache.findUnique.mockResolvedValue({ lat: null, lng: null, displayName: null });
    expect(await service.geocode('Nonexistent Street 999')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache miss queries Nominatim with encoded query + User-Agent, caches and returns the hit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '50.0614', lon: '19.9366', display_name: 'Kraków, Polska' }],
    });
    const result = await service.geocode('Rynek Główny 1, Kraków');
    expect(result).toEqual({ lat: 50.0614, lng: 19.9366, displayName: 'Kraków, Polska' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=');
    expect(url).toContain(encodeURIComponent('rynek główny 1, kraków'));
    expect(init.headers['User-Agent']).toContain('ai-budget-assistant');

    expect(prisma.geocodeCache.upsert).toHaveBeenCalledWith({
      where: { queryNormalized: 'rynek główny 1, kraków' },
      create: {
        queryNormalized: 'rynek główny 1, kraków',
        lat: 50.0614, lng: 19.9366, displayName: 'Kraków, Polska',
      },
      update: {},
    });
  });

  it('empty result array returns null AND writes a negative cache row', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await service.geocode('Zzzz Qqqq 123456')).toBeNull();
    expect(prisma.geocodeCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lat: null, lng: null }),
      }),
    );
  });

  it('network error returns null and caches NOTHING (transient failures are retryable)', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
    expect(prisma.geocodeCache.upsert).not.toHaveBeenCalled();
  });

  it('non-OK HTTP response returns null and caches nothing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
    expect(prisma.geocodeCache.upsert).not.toHaveBeenCalled();
  });

  it('cache read failure is swallowed (fail-silent) and returns null', async () => {
    prisma.geocodeCache.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.geocode('Marszałkowska 10, Warszawa')).toBeNull();
  });
});

describe('GeocodingService.geocodeStructured', () => {
  let prisma: {
    geocodeCache: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      geocodeCache: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    service = new GeocodingService(prisma as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('returns null (no cache, no network) when neither city nor postal code is present', async () => {
    // A street on its own is too ambiguous to geocode reliably.
    expect(await service.geocodeStructured({ street: 'ul. Wojska Polskiego 1' })).toBeNull();
    expect(prisma.geocodeCache.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns cached coordinates without a network call', async () => {
    prisma.geocodeCache.findUnique.mockResolvedValue({
      lat: '53.8890', lng: '17.7150', displayName: 'Brusy, PL',
    });
    const result = await service.geocodeStructured({ city: 'Brusy', postalCode: '89-632' });
    expect(result).toEqual({ lat: 53.889, lng: 17.715, displayName: 'Brusy, PL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache miss queries the STRUCTURED endpoint, STRIPS the "ul." street prefix, caches, returns the hit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '53.8890', lon: '17.7150', display_name: 'Brusy, Polska' }],
    });
    const result = await service.geocodeStructured({
      street: 'ul. Wojska Polskiego 1',
      city: 'Brusy',
      postalCode: '89-632',
      country: 'Poland',
    });
    expect(result).toEqual({ lat: 53.889, lng: 17.715, displayName: 'Brusy, Polska' });

    const [url, init] = fetchMock.mock.calls[0];
    // Structured params — NOT a free-text q= query.
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).not.toContain('&q=');
    expect(url).toContain('city=Brusy');
    expect(url).toContain('postalcode=89-632');
    expect(url).toContain('country=Poland');
    // The "ul." prefix (which Nominatim's structured endpoint rejects) must be gone.
    expect(url).toContain('street=Wojska');
    expect(url).not.toMatch(/street=ul/i);
    expect(init.headers['User-Agent']).toContain('ai-budget-assistant');

    // Cache key is a canonical serialization of the (normalized) parts.
    const upsertArg = prisma.geocodeCache.upsert.mock.calls[0][0];
    expect(upsertArg.where.queryNormalized).toBe(
      'struct|street=wojska polskiego 1|city=brusy|postalcode=89-632|country=poland',
    );
    expect(upsertArg.create).toMatchObject({ lat: 53.889, lng: 17.715 });
  });

  it('falls back to a town-level query (drops the street) when the full structured query has no match', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // tier 1: street → no match
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '53.8862', lon: '17.7190', display_name: 'Brusy, Polska' }],
      }); // tier 2: town centroid
    const result = await service.geocodeStructured({
      street: 'ul. Wojska Polskiego 1',
      city: 'Brusy',
      postalCode: '89-632',
      country: 'Poland',
    });
    expect(result).toEqual({ lat: 53.8862, lng: 17.719, displayName: 'Brusy, Polska' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0];
    expect(secondUrl).not.toContain('street=');
    expect(secondUrl).toContain('city=Brusy');
  });

  it('empty result array returns null AND writes a negative cache row', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await service.geocodeStructured({ city: 'Nowhereville', postalCode: '00-000' })).toBeNull();
    expect(prisma.geocodeCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ lat: null, lng: null }) }),
    );
  });

  it('network error returns null and caches nothing (retryable)', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await service.geocodeStructured({ city: 'Brusy', postalCode: '89-632' })).toBeNull();
    expect(prisma.geocodeCache.upsert).not.toHaveBeenCalled();
  });

  it('cache read failure is swallowed (fail-silent) and returns null', async () => {
    prisma.geocodeCache.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.geocodeStructured({ city: 'Brusy', postalCode: '89-632' })).toBeNull();
  });
});

describe('GeocodingService.search', () => {
  let prisma: { geocodeCache: { findUnique: jest.Mock; upsert: jest.Mock } };
  let cache: { get: jest.Mock; set: jest.Mock };
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = { geocodeCache: { findUnique: jest.fn(), upsert: jest.fn() } };
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new GeocodingService(prisma as any, cache as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('returns [] for queries shorter than 3 chars, without cache or network', async () => {
    expect(await service.search('ab')).toEqual([]);
    expect(cache.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns cached results without a network call', async () => {
    cache.get.mockResolvedValue([{ lat: 1, lng: 2, name: 'X' }]);
    expect(await service.search('Biedronka Gdansk')).toEqual([{ lat: 1, lng: 2, name: 'X' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache miss queries Nominatim with limit=5, maps + caches the results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '54.35', lon: '18.64', display_name: 'Biedronka, Gdańsk' },
        { lat: '54.40', lon: '18.60', display_name: 'Biedronka 2, Gdańsk' },
      ],
    });
    const res = await service.search('Biedronka Gdansk');
    expect(res).toEqual([
      { lat: 54.35, lng: 18.64, name: 'Biedronka, Gdańsk' },
      { lat: 54.40, lng: 18.60, name: 'Biedronka 2, Gdańsk' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('limit=5');
    expect(url).toContain(encodeURIComponent('Biedronka Gdansk'));
    expect(init.headers['User-Agent']).toContain('ai-budget-assistant');
    expect(cache.set).toHaveBeenCalledWith('geo:search:biedronka gdansk', res, 3600);
  });

  it('empty result array returns [] and IS cached', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await service.search('zzz qqq')).toEqual([]);
    expect(cache.set).toHaveBeenCalledWith('geo:search:zzz qqq', [], 3600);
  });

  it('network error returns [] and does NOT cache (retryable)', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await service.search('Biedronka Gdansk')).toEqual([]);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('works without a cache (optional dependency)', async () => {
    const svc = new GeocodingService(prisma as any);
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ lat: '1', lon: '2', display_name: 'Y' }] });
    expect(await svc.search('Some place')).toEqual([{ lat: 1, lng: 2, name: 'Y' }]);
  });
});
