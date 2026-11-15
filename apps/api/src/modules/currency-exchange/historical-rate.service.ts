import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';

/** EUR-based rates (`1 EUR = rates[X] X`, EUR itself included as 1). */
export type EurRates = Record<string, number>;

const SOURCE = 'https://api.frankfurter.dev/v1';
// A past month's closing rate never changes; the TTL only bounds Redis memory
// (allkeys-lru may evict it sooner, which just costs one refetch).
const CACHE_TTL_SEC = 90 * 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 5000;

export function historicalRateCacheKey(month: string): string {
  return `fxh:EUR:${month}`;
}

/** Last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Month-end exchange rates for PAST months, so a history chart can convert
 * each month at the rate of its own last day instead of today's
 * (docs/wiki/features/wallet-balance-history.md).
 *
 * Source: the ECB reference rates via Frankfurter (no key; only a date is
 * sent, never anything about the user). For a weekend or holiday it answers
 * with the last business day before. The ECB set has no UAH, RUB or BYN —
 * callers fall back to today's rate for a currency missing here.
 *
 * Fail-soft by contract: a month that cannot be fetched is simply absent from
 * the result. Never throws.
 */
@Injectable()
export class HistoricalRateService {
  private readonly logger = new Logger(HistoricalRateService.name);

  constructor(private readonly cache: CacheService) {}

  async getMonthEndRates(months: string[]): Promise<Record<string, EurRates>> {
    const out: Record<string, EurRates> = {};
    await Promise.all(
      months.map(async (month) => {
        const rates = await this.ratesFor(month);
        if (rates) out[month] = rates;
      }),
    );
    return out;
  }

  private async ratesFor(month: string): Promise<EurRates | null> {
    const key = historicalRateCacheKey(month);
    const cached = await this.cache.get<EurRates>(key);
    if (cached) return cached;
    try {
      const res = await fetch(`${SOURCE}/${lastDayOfMonth(month)}?base=EUR`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { rates?: Record<string, number> };
      if (!body.rates || Object.keys(body.rates).length === 0) throw new Error('empty rates');
      const rates: EurRates = { ...body.rates, EUR: 1 };
      await this.cache.set(key, rates, CACHE_TTL_SEC);
      return rates;
    } catch (err) {
      this.logger.warn(`Month-end rates for ${month} unavailable: ${(err as Error).message}`);
      return null;
    }
  }
}
