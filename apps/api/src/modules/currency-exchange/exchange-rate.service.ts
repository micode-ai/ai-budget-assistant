import { Injectable, Logger } from '@nestjs/common';

interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private cache = new Map<string, CachedRates>();

  async getRates(baseCurrency: string): Promise<{ base: string; rates: Record<string, number>; updatedAt: string }> {
    // Check cache
    const cached = this.cache.get(baseCurrency);
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
      const supportedCurrencies = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB'];
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
      this.cache.set(baseCurrency, entry);

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
