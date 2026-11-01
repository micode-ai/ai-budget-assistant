import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';
import { PublicApiError } from './public-api-error';

/** Spec section 6 starting values, kept in one place. Verified apps override per client row. */
export const PUBLIC_API_RATE_LIMITS = { perGrant: 120, perClient: 1200, windowMs: 60_000 } as const;

export interface PublicApiRateLimitOverrides {
  perGrant?: number | null;
  perClient?: number | null;
}

export interface PublicApiRateLimitResult {
  limit: number;
  remaining: number;
  /** Present only when the request is over a limit. */
  retryAfterSec?: number;
}

/**
 * Fixed 60 s windows on `pa:g:<grantId>` and `pa:c:<clientDbId>`. Fails closed: a Redis error is a
 * `503 unavailable`, never "unlimited" (the counter primitive does not swallow errors on purpose).
 */
@Injectable()
export class PublicApiRateLimitService {
  private readonly logger = new Logger(PublicApiRateLimitService.name);

  constructor(private readonly cache: CacheService) {}

  async check(grantId: string, clientDbId: string, overrides: PublicApiRateLimitOverrides): Promise<PublicApiRateLimitResult> {
    const grantLimit = positiveOr(overrides.perGrant, PUBLIC_API_RATE_LIMITS.perGrant);
    const clientLimit = positiveOr(overrides.perClient, PUBLIC_API_RATE_LIMITS.perClient);
    const windowMs = PUBLIC_API_RATE_LIMITS.windowMs;

    try {
      const g = await this.cache.incrementWindowWithTtl(`pa:g:${grantId}`, windowMs);
      // A request the grant limit already refuses does not also spend the client's shared budget.
      if (g.hits > grantLimit) return { limit: grantLimit, remaining: 0, retryAfterSec: toSec(g.ttlMs) };

      const c = await this.cache.incrementWindowWithTtl(`pa:c:${clientDbId}`, windowMs);
      if (c.hits > clientLimit) return { limit: clientLimit, remaining: 0, retryAfterSec: toSec(c.ttlMs) };

      const grantLeft = grantLimit - g.hits;
      const clientLeft = clientLimit - c.hits;
      // Headers describe whichever counter will bite first.
      return grantLeft <= clientLeft ? { limit: grantLimit, remaining: grantLeft } : { limit: clientLimit, remaining: clientLeft };
    } catch (e) {
      this.logger.warn(`public API rate-limit counter failed: ${(e as Error).message}`);
      throw new PublicApiError(503, 'unavailable', 'The service is temporarily unavailable. Retry shortly.');
    }
  }
}

function positiveOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback;
}

function toSec(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}
