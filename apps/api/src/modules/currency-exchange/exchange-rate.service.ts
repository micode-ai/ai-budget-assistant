import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';

interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — freshness window
// Redis keeps the entry far longer than it is "fresh" so a failed refetch can still serve the stale copy.
const STALE_RETENTION_SEC = 7 * 24 * 60 * 60;

export const fxRatesCacheKey = (base: string) => `fx:rates:${base}`;

/** The currencies this provider returns rates for. Anything else has no rate here. */
export const SUPPORTED_RATE_CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN', 'CZK', 'SEK', 'NOK', 'DKK', 'HUF', 'RON', 'CHF', 'BRL'] as const;

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(private readonly cache: CacheService) {}

  async getRates(baseCurrency: string): Promise<{ base: string; rates: Record<string, number>; updatedAt: string }> {
    // Check cache
    const cached = await this.cache.get<CachedRates>(fxRatesCacheKey(baseCurrency));
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return {
        base: cached.base,
        rates: cached.rates,
        updatedAt: new Date(cached.fetchedAt).toISOString(),
      };
    }

    // Fetch from API
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
      if (!response.ok) {
        throw new Error(`Exchange rate API returned ${response.status}`);
      }

      const data = await response.json();

      // Filter to only supported currencies
      const supportedCurrencies = SUPPORTED_RATE_CURRENCIES;
      const rates: Record<string, number> = {};
      for (const currency of supportedCurrencies) {
        if (data.rates[currency] !== undefined) {
          rates[currency] = data.rates[currency];
        }
      }

      const entry: CachedRates = {
        base: baseCurrency,
        rates,
        fetchedAt: Date.now(),
      };
      await this.cache.set(fxRatesCacheKey(baseCurrency), entry, STALE_RETENTION_SEC);

      return {
        base: baseCurrency,
        rates,
        updatedAt: new Date(entry.fetchedAt).toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rates: ${error}`);

      // Return cached if available (even if stale)
      if (cached) {
        return {
          base: cached.base,
          rates: cached.rates,
          updatedAt: new Date(cached.fetchedAt).toISOString(),
        };
      }

      throw error;
    }
  }
}
