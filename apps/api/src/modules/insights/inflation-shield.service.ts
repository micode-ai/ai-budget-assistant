import { Injectable, Logger } from '@nestjs/common';
import { PriceHistoryService } from '../price-history/price-history.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { SafeToSpendService } from './safe-to-spend.service';
import { CacheService } from '../../common/cache/cache.service';
import { assembleShield, SHIELD_DEFAULTS, ShieldOpts } from './inflation-shield.util';
import { InflationShieldTrackingService } from './inflation-shield-tracking.service';
import type { InflationShieldResponse, ShieldItem } from '@budget/shared-types';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { getRatesSafe } from '../../common/utils/fx';

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

@Injectable()
export class InflationShieldService {
  private readonly logger = new Logger(InflationShieldService.name);

  constructor(
    private readonly priceHistory: PriceHistoryService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly safeToSpend: SafeToSpendService,
    private readonly cache: CacheService,
    private readonly tracking: InflationShieldTrackingService,
  ) {}

  private opts(): ShieldOpts {
    return {
      minMonthlyRisePct: envNum('SHIELD_MIN_MONTHLY_RISE_PCT', SHIELD_DEFAULTS.minMonthlyRisePct),
      minCadenceDays: envNum('SHIELD_MIN_CADENCE_DAYS', SHIELD_DEFAULTS.minCadenceDays),
      maxStockWeeks: envNum('SHIELD_MAX_STOCK_WEEKS', SHIELD_DEFAULTS.maxStockWeeks),
      maxUnits: envNum('SHIELD_MAX_UNITS', SHIELD_DEFAULTS.maxUnits),
      minPoints: envNum('SHIELD_MIN_POINTS', SHIELD_DEFAULTS.minPoints),
      horizonWeeks: envNum('SHIELD_HORIZON_WEEKS', SHIELD_DEFAULTS.horizonWeeks),
      forecastLookbackWeeks: envNum('SHIELD_FORECAST_LOOKBACK_WEEKS', SHIELD_DEFAULTS.forecastLookbackWeeks),
      minSpanDays: envNum('SHIELD_MIN_SPAN_DAYS', SHIELD_DEFAULTS.minSpanDays),
    };
  }

  // `now` is injectable for deterministic tests; the controller omits it (defaults to real time).
  async getShield(
    accountId: string,
    userId: string,
    baseCurrency: string,
    now: Date = new Date(),
  ): Promise<InflationShieldResponse> {
    const cacheKey = `shield:${accountId}:${baseCurrency}`;
    const cached = await this.cache.get<InflationShieldResponse>(cacheKey);
    if (cached) return cached;

    const trends = await this.priceHistory.getProductTrends(accountId);
    const rates = await getRatesSafe(this.exchangeRate, baseCurrency);
    if (rates === null) {
      this.logger.warn(`shield: FX rates unavailable for ${baseCurrency}`);
    }

    // Plan 1: personal store hint (latest merchant). Plan 2's community store may later override this.
    const assembled = assembleShield(
      trends.map((t) => ({
        canonicalName: t.canonicalName,
        currency: t.currency,
        points: t.points,
        purchaseDates: t.purchaseDates,
        currentBestPrice: t.currentBestPrice,
        store: t.latestMerchant ?? null,
      })),
      baseCurrency,
      rates,
      now,
      this.opts(),
    );

    // One affordability read: is the largest stock-up outlay within reach today?
    let projectedAvailable = Infinity;
    try {
      const sts = await this.safeToSpend.compute(accountId, userId, baseCurrency);
      projectedAvailable = sts.projectedAvailable;
    } catch {
      // safe-to-spend unavailable → don't block; treat as affordable.
      this.logger.warn('shield: safe-to-spend unavailable; treating stock-up as affordable');
    }

    const items: ShieldItem[] = assembled.items.map((i) => ({
      canonicalName: i.canonicalName,
      monthlyChangePct: i.monthlyChangePct,
      currentPrice: i.currentPrice,
      projectedPrice: i.projectedPrice,
      quantity: i.quantity,
      projectedSaving: i.projectedSaving,
      store: i.store,
      currencyOriginal: i.currencyOriginal,
      affordableToday: i.currentPrice * i.quantity <= projectedAvailable,
    }));

    // Realized savings to date, converted into the current display currency.
    let savedSoFar = 0;
    let savedSoFarApprox = false;
    try {
      const acted = await this.tracking.getActedRecommendations(accountId);
      for (const a of acted) {
        if (a.currencyCode === baseCurrency) {
          savedSoFar += a.realizedSaving;
        } else if (rates && rates[a.currencyCode] > 0) {
          savedSoFar += a.realizedSaving / rates[a.currencyCode];
          savedSoFarApprox = true;
        } else {
          // unknown rate → dropped from the sum; mark approximate since a value was excluded
          savedSoFarApprox = true;
        }
      }
      savedSoFar = Math.round(savedSoFar * 100) / 100;
    } catch {
      savedSoFar = 0; // tracking unavailable → don't block the shield
      savedSoFarApprox = false;
    }

    const result: InflationShieldResponse = {
      baseCurrency,
      items,
      basketMonthlyForecastPct: assembled.basketMonthlyForecastPct,
      totalProjectedSaving: assembled.totalProjectedSaving,
      savedSoFar,
      hasEnoughData: assembled.hasEnoughData,
      fxApproximate: assembled.fxApproximate || savedSoFarApprox,
      computedAt: now.toISOString(),
    };

    // Persist surfaced recommendations for later realized-savings reconciliation.
    void this.tracking
      .recordRecommendations(
        accountId,
        items.map((i) => ({
          canonicalName: i.canonicalName,
          currentPrice: i.currentPrice,
          projectedPrice: i.projectedPrice,
          quantity: i.quantity,
          projectedSaving: i.projectedSaving,
        })),
        baseCurrency,
        now,
      )
      .catch(logFireAndForget(this.logger, 'InflationShieldService.recordRecommendations'));

    await this.cache.set(cacheKey, result, 3600);
    return result;
  }
}
