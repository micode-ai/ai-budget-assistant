import { PublicApiError } from './public-api-error';
import { PUBLIC_API_RATE_LIMITS, PublicApiRateLimitService } from './public-api-rate-limit.service';

/** In-memory stand-in for Redis fixed windows: key -> hits, ttl fixed at 42.3 s. */
function fakeCache() {
  const hits = new Map<string, number>();
  return {
    hits,
    incrementWindowWithTtl: jest.fn(async (key: string, windowMs: number) => {
      expect(windowMs).toBe(60_000);
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return { hits: n, ttlMs: 42_300 };
    }),
  };
}

describe('PublicApiRateLimitService', () => {
  it('keeps the starting values in one config object', () => {
    expect(PUBLIC_API_RATE_LIMITS).toEqual({ perGrant: 120, perClient: 1200, windowMs: 60_000 });
  });

  it('allows 120 requests per grant per minute and rejects the 121st with Retry-After', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    let last;
    for (let i = 0; i < 120; i++) last = await svc.check('g1', 'c1', {});
    expect(last).toEqual({ limit: 120, remaining: 0 });

    const over = await svc.check('g1', 'c1', {});
    expect(over).toEqual({ limit: 120, remaining: 0, retryAfterSec: 43 });
    expect(cache.incrementWindowWithTtl).toHaveBeenCalledWith('pa:g:g1', 60_000);
    expect(cache.incrementWindowWithTtl).toHaveBeenCalledWith('pa:c:c1', 60_000);
  });

  it('reports the remaining budget of the more restrictive counter on success', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    expect(await svc.check('g1', 'c1', {})).toEqual({ limit: 120, remaining: 119 });
    cache.hits.set('pa:c:c1', 1150);
    expect(await svc.check('g1', 'c1', {})).toEqual({ limit: 1200, remaining: 49 });
  });

  it('honours the verified per-grant override of 600', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    cache.hits.set('pa:g:g1', 120);
    expect(await svc.check('g1', 'c1', { perGrant: 600, perClient: 10_000 })).toEqual({ limit: 600, remaining: 479 });
    cache.hits.set('pa:g:g1', 600);
    expect(await svc.check('g1', 'c1', { perGrant: 600, perClient: 10_000 })).toMatchObject({ limit: 600, remaining: 0, retryAfterSec: 43 });
  });

  it('applies the per-client limit across grants (1,200 default, override honoured)', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    cache.hits.set('pa:c:c1', 1200);
    expect(await svc.check('g2', 'c1', {})).toEqual({ limit: 1200, remaining: 0, retryAfterSec: 43 });
    expect(await svc.check('g3', 'c1', { perClient: 10_000 })).toEqual({ limit: 120, remaining: 119 });
  });

  it('does not spend the client budget on a request the grant limit already rejected', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    cache.hits.set('pa:g:g1', 120);
    await svc.check('g1', 'c1', {});
    expect(cache.hits.get('pa:c:c1')).toBeUndefined();
  });

  it('ignores a non-positive override and uses the default', async () => {
    const cache = fakeCache();
    const svc = new PublicApiRateLimitService(cache as any);
    expect(await svc.check('g1', 'c1', { perGrant: 0, perClient: null })).toEqual({ limit: 120, remaining: 119 });
  });

  it('fails closed with 503 unavailable when Redis errors', async () => {
    const cache = { incrementWindowWithTtl: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const svc = new PublicApiRateLimitService(cache as any);
    const err = await svc.check('g1', 'c1', {}).catch((e) => e);
    expect(err).toBeInstanceOf(PublicApiError);
    expect(err.getStatus()).toBe(503);
    expect(err.code).toBe('unavailable');
  });
});
