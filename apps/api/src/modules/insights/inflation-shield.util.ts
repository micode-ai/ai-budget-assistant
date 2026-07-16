// Pure, unit-tested Inflation Shield math. `now` is always injected — never call
// Date.now()/new Date() argless here (repo convention).

const WEEK_MS = 7 * 86_400_000;

export interface TrendForecast {
  monthlyChangePct: number;                 // % per month (positive = rising)
  direction: 'rising' | 'falling' | 'flat';
  weeksObserved: number;
  hasSignal: boolean;                       // false when too few points / span too short to trust a trend
}

/**
 * Least-squares price trend over a lookback window, expressed as % per month.
 * Guarded by a minimum observed span so two near-adjacent points can't
 * extrapolate a wild slope (returns hasSignal:false — "silent on doubt").
 * Handles sparse/irregular purchases: any >=2 points spanning >= minSpanDays
 * yield a trend, without requiring a point in two fixed adjacent windows.
 */
export function forecastProductTrend(
  points: { date: string; price: number }[],
  now: Date,
  opts: { lookbackWeeks?: number; minSpanDays?: number; flatThresholdPct?: number } = {},
): TrendForecast {
  const lookbackWeeks = opts.lookbackWeeks ?? 12;
  const minSpanDays = opts.minSpanDays ?? 14;
  const flat = opts.flatThresholdPct ?? 1;
  const pts = points
    .map((p) => ({ t: new Date(p.date).getTime(), price: p.price }))
    .filter((p) => Number.isFinite(p.t) && p.price > 0)
    .sort((a, b) => a.t - b.t);
  const nowMs = now.getTime();
  const lookbackCut = nowMs - lookbackWeeks * WEEK_MS;
  const win = pts.filter((p) => p.t >= lookbackCut);
  if (win.length < 2) return { monthlyChangePct: 0, direction: 'flat', weeksObserved: 0, hasSignal: false };

  const spanMs = win[win.length - 1].t - win[0].t;
  const weeksObserved = Math.round((spanMs / WEEK_MS) * 10) / 10;
  const spanDays = spanMs / 86_400_000;
  if (spanDays < minSpanDays) {
    return { monthlyChangePct: 0, direction: 'flat', weeksObserved, hasSignal: false };
  }

  // Least-squares slope of price vs. days-since-first-point.
  const x = win.map((p) => (p.t - win[0].t) / 86_400_000);
  const y = win.map((p) => p.price);
  const n = win.length;
  const xbar = x.reduce((s, v) => s + v, 0) / n;
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xbar) * (y[i] - ybar);
    den += (x[i] - xbar) ** 2;
  }
  const slopePerDay = den > 0 ? num / den : 0;
  const monthlyChange = slopePerDay * 30.44;               // price change per month
  const pct = ybar > 0 ? (monthlyChange / ybar) * 100 : 0; // relative to mean price
  const rounded = Math.round(pct * 10) / 10;
  const direction: TrendForecast['direction'] =
    rounded > flat ? 'rising' : rounded < -flat ? 'falling' : 'flat';
  return { monthlyChangePct: rounded, direction, weeksObserved, hasSignal: true };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median gap in days between purchases, or null below 3 purchases. */
export function estimateCadenceDays(purchaseDates: Date[]): number | null {
  if (purchaseDates.length < 3) return null;
  const sorted = [...purchaseDates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000);
  }
  const med = median(gaps);
  return med > 0 ? Math.round(med * 10) / 10 : null;
}

export interface StockpileVerdict {
  ok: boolean;
  maxStockWeeks: number;
  reason: 'ok' | 'unknown_cadence' | 'perishable_short_cadence';
}

/**
 * Conservative: a product is stockpileable only if bought infrequently enough
 * that a stock won't perish (short cadence => perishable => excluded), and the
 * stock is capped to `maxStockWeeks`. Silent (ok:false) when cadence is unknown.
 */
export function isStockpileable(
  cadenceDays: number | null,
  opts: { minCadenceDays?: number; maxStockWeeks?: number } = {},
): StockpileVerdict {
  const minCadence = opts.minCadenceDays ?? 14;
  const maxWeeks = opts.maxStockWeeks ?? 8;
  if (cadenceDays == null) return { ok: false, maxStockWeeks: 0, reason: 'unknown_cadence' };
  if (cadenceDays < minCadence) return { ok: false, maxStockWeeks: 0, reason: 'perishable_short_cadence' };
  return { ok: true, maxStockWeeks: maxWeeks, reason: 'ok' };
}

export interface StockRecommendation {
  quantity: number;
  projectedPrice: number;  // same currency as currentBestPrice
  projectedSaving: number;
}

/** How many units to buy now, and the projected saving vs buying later. */
export function recommendStockUp(input: {
  cadenceDays: number;
  monthlyChangePct: number;
  horizonWeeks: number;
  currentBestPrice: number;
  maxStockWeeks: number;
  maxUnits: number;
}): StockRecommendation {
  const { cadenceDays, monthlyChangePct, horizonWeeks, currentBestPrice, maxStockWeeks, maxUnits } = input;
  const consumptionPerWeek = 7 / cadenceDays;
  const weeks = Math.min(horizonWeeks, maxStockWeeks);
  const quantity = Math.min(Math.max(Math.ceil(consumptionPerWeek * weeks), 1), maxUnits);
  const horizonMonths = horizonWeeks / 4.345;
  const projectedPrice = Math.round(currentBestPrice * (1 + (monthlyChangePct / 100) * horizonMonths) * 100) / 100;
  // Linear-ramp model: without stocking up, the user buys these units gradually
  // as the price climbs from current to projected, so the avoided cost per unit
  // is the AVERAGE gap ≈ (projectedPrice − currentPrice)/2, not the full end gap.
  const projectedSaving = Math.round(((projectedPrice - currentBestPrice) / 2) * quantity * 100) / 100;
  return { quantity, projectedPrice, projectedSaving };
}

export interface ShieldProductInput {
  canonicalName: string;
  currency: string;                 // product's native currency
  points: { date: string; price: number }[];
  purchaseDates: Date[];
  currentBestPrice: number;         // current price in native currency (latest personal price; Plan 2 may lower via community)
  store: string | null;            // community cheapest store, or null (Plan 1)
}

export interface AssembledShieldItem {
  canonicalName: string;
  monthlyChangePct: number;
  currentPrice: number;             // baseCurrency
  projectedPrice: number;           // baseCurrency
  quantity: number;
  projectedSaving: number;          // baseCurrency
  store: string | null;
  currencyOriginal: string;
}

export interface AssembledShield {
  items: AssembledShieldItem[];
  basketMonthlyForecastPct: number | null;
  totalProjectedSaving: number;
  hasEnoughData: boolean;
  fxApproximate: boolean;
}

export interface ShieldOpts {
  minMonthlyRisePct: number;
  minCadenceDays: number;
  maxStockWeeks: number;
  maxUnits: number;
  minPoints: number;
  horizonWeeks: number;
  forecastLookbackWeeks: number;   // NEW
  minSpanDays: number;             // NEW
}

export const SHIELD_DEFAULTS: ShieldOpts = {
  minMonthlyRisePct: 5,
  minCadenceDays: 14,
  maxStockWeeks: 8,
  maxUnits: 12,
  minPoints: 3,
  horizonWeeks: 4,
  forecastLookbackWeeks: 12,       // NEW
  minSpanDays: 14,                 // NEW
};

// 1 base = rates[X] X  ⇒  amount_in_base = amount / rates[from]
function convertToBase(amount: number, from: string, base: string, rates: Record<string, number> | null): number | null {
  if (from === base) return amount;
  if (!rates) return null;
  const r = rates[from];
  return r && r > 0 ? amount / r : null;
}

export function assembleShield(
  products: ShieldProductInput[],
  baseCurrency: string,
  rates: Record<string, number> | null,
  now: Date,
  opts: ShieldOpts = SHIELD_DEFAULTS,
): AssembledShield {
  const items: AssembledShieldItem[] = [];
  let fxApproximate = false;
  let productsEvaluated = 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const p of products) {
    if (p.points.length < opts.minPoints) continue;

    const priceBase = convertToBase(p.currentBestPrice, p.currency, baseCurrency, rates);
    if (priceBase == null) { fxApproximate = true; continue; }
    if (p.currency !== baseCurrency) fxApproximate = true;
    productsEvaluated++;

    const forecast = forecastProductTrend(p.points, now, {
      lookbackWeeks: opts.forecastLookbackWeeks,
      minSpanDays: opts.minSpanDays,
      flatThresholdPct: 1,
    });

    // Basket-wide forecast: weight each product's monthly change by its base price.
    // No-signal products don't dilute the basket toward zero (finding #6).
    if (forecast.hasSignal) {
      weightedSum += priceBase * forecast.monthlyChangePct;
      totalWeight += priceBase;
    }

    if (forecast.monthlyChangePct < opts.minMonthlyRisePct) continue;

    const cadence = estimateCadenceDays(p.purchaseDates);
    const stock = isStockpileable(cadence, {
      minCadenceDays: opts.minCadenceDays,
      maxStockWeeks: opts.maxStockWeeks,
    });
    if (!stock.ok || cadence == null) continue;

    const rec = recommendStockUp({
      cadenceDays: cadence,
      monthlyChangePct: forecast.monthlyChangePct,
      horizonWeeks: opts.horizonWeeks,
      currentBestPrice: priceBase,
      maxStockWeeks: stock.maxStockWeeks,
      maxUnits: opts.maxUnits,
    });
    if (rec.projectedSaving <= 0) continue;

    items.push({
      canonicalName: p.canonicalName,
      monthlyChangePct: forecast.monthlyChangePct,
      currentPrice: Math.round(priceBase * 100) / 100,
      projectedPrice: rec.projectedPrice,
      quantity: rec.quantity,
      projectedSaving: rec.projectedSaving,
      store: p.store,
      currencyOriginal: p.currency,
    });
  }

  items.sort((a, b) => b.projectedSaving - a.projectedSaving);
  const totalProjectedSaving = Math.round(items.reduce((s, i) => s + i.projectedSaving, 0) * 100) / 100;
  const basketMonthlyForecastPct = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;

  return {
    items,
    basketMonthlyForecastPct,
    totalProjectedSaving,
    hasEnoughData: productsEvaluated > 0,
    fxApproximate,
  };
}
