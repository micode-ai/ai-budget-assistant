import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TWELVE_DATA_CONFIG = {
  baseUrl: 'https://api.twelvedata.com',
  maxRequestsPerDay: 800,
  priceCacheTtlSeconds: 300,
  historicalCacheTtlSeconds: 86400,
  batchPriceLimit: 8,
};

interface TwelveDataSearchResult {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  exchange_timezone: string;
  instrument_type: string;
  country: string;
  currency: string;
}

interface TwelveDataPriceResponse {
  price: string;
}

interface TwelveDataTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AssetSearchResult {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity';
  exchange: string;
  currency: string;
  isRecommended?: boolean;
}

// Yahoo Finance exchange suffix mapping (fallback when Twelve Data unavailable)
const YAHOO_EXCHANGE_SUFFIX: Record<string, string> = {
  'XETR': '.DE',
  'XDUS': '.DU',
  'Munich': '.MU',
  'XMUN': '.MU',
  'XHAM': '.HM',
  'LSE': '.L',
  'Euronext Paris': '.PA',
  'Euronext Amsterdam': '.AS',
  'Milan': '.MI',
  'SIX': '.SW',
  'TSX': '.TO',
  'ASX': '.AX',
  'NSE': '.NS',
  'BSE': '.BO',
};

// Simple in-memory cache for when Redis is not configured
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();
let dailyRequestCount = 0;
let dailyResetDate = new Date().toDateString();

@Injectable()
export class TwelveDataService {
  private readonly logger = new Logger(TwelveDataService.name);
  private readonly apiKey: string;
  private readonly baseUrl = TWELVE_DATA_CONFIG.baseUrl;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TWELVE_DATA_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('TWELVE_DATA_API_KEY not configured. Investment price features will be unavailable.');
    }
  }

  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    if (!this.apiKey || !query.trim()) return [];

    const cacheKey = `td:search:${query.toLowerCase()}`;
    const cached = this.getFromCache<AssetSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.baseUrl}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=20`;
      const response = await this.fetchApi<{ data: TwelveDataSearchResult[] }>(url);

      if (!response?.data) return [];

      const results: AssetSearchResult[] = response.data.map((item) => ({
        symbol: item.symbol,
        name: item.instrument_name,
        type: this.mapInstrumentType(item.instrument_type),
        exchange: item.exchange,
        currency: item.currency,
      }));

      // Mark recommended and sort results
      const sortedResults = this.sortAndMarkRecommended(results, query);

      this.setCache(cacheKey, sortedResults, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
      return sortedResults;
    } catch (error) {
      this.logger.error(`Failed to search assets: ${error}`);
      return [];
    }
  }

  async getCurrentPrice(symbol: string, exchange?: string): Promise<number | null> {
    const symbolKey = exchange ? `${symbol}:${exchange}` : symbol;
    const cacheKey = `td:price:${symbolKey}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    // Try Twelve Data first
    if (this.apiKey) {
      try {
        const url = `${this.baseUrl}/price?symbol=${encodeURIComponent(symbolKey)}&apikey=${this.apiKey}`;
        const response = await this.fetchApi<TwelveDataPriceResponse>(url);

        if (response?.price) {
          const price = parseFloat(response.price);
          if (!isNaN(price) && price > 0) {
            this.setCache(cacheKey, price, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
            return price;
          }
        }
      } catch (error) {
        this.logger.warn(`Twelve Data price failed for ${symbolKey}: ${error}`);
      }
    }

    // Fallback to Yahoo Finance
    const yahooPrice = await this.getYahooPrice(symbol, exchange);
    if (yahooPrice !== null) {
      this.setCache(cacheKey, yahooPrice, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
    }
    return yahooPrice;
  }

  async getBatchPrices(symbols: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!this.apiKey || symbols.length === 0) return result;

    // Check cache first
    const uncached: string[] = [];
    for (const symbol of symbols) {
      const cached = this.getFromCache<number>(`td:price:${symbol}`);
      if (cached !== null) {
        result.set(symbol, cached);
      } else {
        uncached.push(symbol);
      }
    }

    if (uncached.length === 0) return result;

    // Batch requests in groups of max batchPriceLimit
    const batches: string[][] = [];
    for (let i = 0; i < uncached.length; i += TWELVE_DATA_CONFIG.batchPriceLimit) {
      batches.push(uncached.slice(i, i + TWELVE_DATA_CONFIG.batchPriceLimit));
    }

    for (const batch of batches) {
      try {
        const symbolsCsv = batch.join(',');
        const url = `${this.baseUrl}/price?symbol=${encodeURIComponent(symbolsCsv)}&apikey=${this.apiKey}`;
        const response = await this.fetchApi<Record<string, TwelveDataPriceResponse>>(url);

        if (!response) continue;

        // Single symbol returns { price: "123" }, multiple returns { SYMBOL: { price: "123" }, ... }
        if (batch.length === 1 && 'price' in response) {
          const price = parseFloat((response as unknown as TwelveDataPriceResponse).price);
          if (!isNaN(price) && price > 0) {
            result.set(batch[0], price);
            this.setCache(`td:price:${batch[0]}`, price, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
          }
        } else {
          for (const symbol of batch) {
            const data = response[symbol];
            if (data?.price) {
              const price = parseFloat(data.price);
              if (!isNaN(price) && price > 0) {
                result.set(symbol, price);
                this.setCache(`td:price:${symbol}`, price, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to get batch prices: ${error}`);
      }
    }

    // Fallback to Yahoo Finance for symbols that Twelve Data couldn't resolve
    const missing = symbols.filter((s) => !result.has(s));
    for (const symbolKey of missing) {
      const [sym, exch] = symbolKey.includes(':') ? symbolKey.split(':') : [symbolKey, undefined];
      const price = await this.getYahooPrice(sym, exch);
      if (price !== null) {
        result.set(symbolKey, price);
        this.setCache(`td:price:${symbolKey}`, price, TWELVE_DATA_CONFIG.priceCacheTtlSeconds);
      }
    }

    return result;
  }

  async getTimeSeries(symbol: string, days: number): Promise<PricePoint[]> {
    const cacheKey = `td:series:${symbol}:${days}`;
    const cached = this.getFromCache<PricePoint[]>(cacheKey);
    if (cached) return cached;

    // Try Twelve Data first
    if (this.apiKey) {
      try {
        const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${days}&apikey=${this.apiKey}`;
        const response = await this.fetchApi<{ values: TwelveDataTimeSeriesValue[] }>(url);

        if (response?.values && response.values.length > 0) {
          const points: PricePoint[] = response.values.map((v) => ({
            date: v.datetime,
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseInt(v.volume) || 0,
          }));

          this.setCache(cacheKey, points, TWELVE_DATA_CONFIG.historicalCacheTtlSeconds);
          return points;
        }
      } catch (error) {
        this.logger.warn(`Twelve Data time series failed for ${symbol}: ${error}`);
      }
    }

    // Fallback to Yahoo Finance
    const [sym, exch] = symbol.includes(':') ? symbol.split(':') : [symbol, undefined];
    const yahooPoints = await this.getYahooTimeSeries(sym, exch, days);
    if (yahooPoints.length > 0) {
      this.setCache(cacheKey, yahooPoints, TWELVE_DATA_CONFIG.historicalCacheTtlSeconds);
    }
    return yahooPoints;
  }

  // ---- Yahoo Finance Fallback ----

  private toYahooSymbol(symbol: string, exchange?: string): string {
    if (!exchange) return symbol;
    const suffix = YAHOO_EXCHANGE_SUFFIX[exchange];
    return suffix ? `${symbol}${suffix}` : symbol;
  }

  private async getYahooPrice(symbol: string, exchange?: string): Promise<number | null> {
    const yahooSymbol = this.toYahooSymbol(symbol, exchange);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) return null;

      const data = await response.json() as any;
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === 'number' && price > 0) {
        this.logger.log(`Yahoo Finance price for ${yahooSymbol}: ${price}`);
        return price;
      }
      return null;
    } catch (error) {
      this.logger.warn(`Yahoo Finance price failed for ${yahooSymbol}: ${error}`);
      return null;
    }
  }

  private async getYahooTimeSeries(symbol: string, exchange?: string, days: number = 30): Promise<PricePoint[]> {
    const yahooSymbol = this.toYahooSymbol(symbol, exchange);
    const rangeMap: Record<string, string> = { '7': '5d', '30': '1mo', '90': '3mo', '365': '1y', '1825': '5y' };
    const range = rangeMap[String(days)] || (days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 365 ? '1y' : '5y');

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) return [];

      const data = await response.json() as any;
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators.quote[0];
      const points: PricePoint[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const close = quote.close?.[i];
        if (close == null) continue;
        points.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: quote.open?.[i] ?? close,
          high: quote.high?.[i] ?? close,
          low: quote.low?.[i] ?? close,
          close,
          volume: quote.volume?.[i] ?? 0,
        });
      }

      if (points.length > 0) {
        this.logger.log(`Yahoo Finance history for ${yahooSymbol}: ${points.length} points`);
      }
      return points;
    } catch (error) {
      this.logger.warn(`Yahoo Finance history failed for ${yahooSymbol}: ${error}`);
      return [];
    }
  }

  private async fetchApi<T>(url: string): Promise<T | null> {
    if (!this.checkRateLimit()) {
      this.logger.warn('Twelve Data daily rate limit reached');
      return null;
    }

    const response = await fetch(url.includes('apikey=') ? url : `${url}&apikey=${this.apiKey}`);

    this.incrementDailyCounter();

    if (!response.ok) {
      this.logger.error(`Twelve Data API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.json() as Promise<T>;
  }

  private mapInstrumentType(type: string): 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity' {
    const lower = type.toLowerCase();
    if (lower.includes('crypto') || lower === 'digital currency') return 'crypto';
    if (lower.includes('etf')) return 'etf';
    if (lower.includes('bond')) return 'bond';
    if (lower.includes('commodity')) return 'commodity';
    return 'stock';
  }

  /**
   * Sort search results and mark the most relevant one as recommended.
   * Priority logic:
   * - Exact symbol match gets highest priority
   * - For crypto: USD pairs from major exchanges (Coinbase, Binance) preferred
   * - For stocks: Major exchanges (NYSE, NASDAQ) preferred
   * - USD currency preferred over others
   */
  private sortAndMarkRecommended(results: AssetSearchResult[], query: string): AssetSearchResult[] {
    if (results.length === 0) return results;

    const queryUpper = query.toUpperCase().trim();

    // Priority exchanges by asset type
    const cryptoExchangePriority: Record<string, number> = {
      'Coinbase': 1,
      'Binance': 2,
      'Kraken': 3,
      'Gemini': 4,
      'Bitstamp': 5,
    };

    const stockExchangePriority: Record<string, number> = {
      'NYSE': 1,
      'NASDAQ': 2,
      'AMEX': 3,
      'LSE': 4,
      'XETRA': 5,
    };

    // Calculate score for each result (lower is better)
    const scored = results.map((item) => {
      let score = 100;

      // Exact symbol match - highest priority
      if (item.symbol.toUpperCase() === queryUpper) {
        score -= 50;
      } else if (item.symbol.toUpperCase().startsWith(queryUpper)) {
        score -= 30;
      }

      // USD currency preferred
      if (item.currency === 'USD') {
        score -= 20;
      }

      // Exchange priority based on asset type
      if (item.type === 'crypto') {
        const exchangePriority = cryptoExchangePriority[item.exchange];
        if (exchangePriority) {
          score -= (6 - exchangePriority) * 3; // 15, 12, 9, 6, 3 points
        }
      } else {
        const exchangePriority = stockExchangePriority[item.exchange];
        if (exchangePriority) {
          score -= (6 - exchangePriority) * 3;
        }
      }

      return { item, score };
    });

    // Sort by score (ascending - lower is better)
    scored.sort((a, b) => a.score - b.score);

    // Mark only the top result as recommended
    const sorted = scored.map(({ item }, index) => ({
      ...item,
      isRecommended: index === 0,
    }));

    return sorted;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown, ttlSeconds: number): void {
    memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private checkRateLimit(): boolean {
    const today = new Date().toDateString();
    if (today !== dailyResetDate) {
      dailyRequestCount = 0;
      dailyResetDate = today;
    }
    return dailyRequestCount < TWELVE_DATA_CONFIG.maxRequestsPerDay;
  }

  private incrementDailyCounter(): void {
    dailyRequestCount++;
  }
}
