# Inflation Shield — Engine & Endpoint (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a free `GET /insights/inflation-shield` that forecasts each tracked product's price from the user's receipt history and returns actionable "stock up now, save X" recommendations.

**Architecture:** A pure, unit-tested `inflation-shield.util.ts` (forecast + stockpileability + quantity + assembly math) sits under a thin `InflationShieldService` that does Prisma IO via the existing `PriceHistoryService`, FX via `ExchangeRateService`, and an affordability flag via `SafeToSpendService`. One new `GET /insights/inflation-shield` route on the existing `InsightsController`. No migration, no LLM cost.

**Tech Stack:** NestJS 10, Prisma 5, Jest, TypeScript. Shared DTOs in `packages/shared-types`.

**Design spec:** `docs/superpowers/specs/2026-07-15-inflation-shield-design.md`

## Global Constraints

- **This plan is Plan 1 of 3.** Scope = engine + free endpoint (spec sections 2 + the read path of 3). Realized-savings tracking, cron/push (Plan 2), and mobile UI + AI chat tool (Plan 3) are OUT of scope here. Do not build them.
- **Data source in Plan 1 = personal history only.** The pure util already accepts an optional community `store`/`currentBestPrice`, but the service passes personal data only (`store: null`, `currentBestPrice = latest personal unit price`). Community-boost wiring is the first task of Plan 2. This is valid graceful degradation.
- **Endpoint is FREE** — `JwtAuthGuard + AccountContextGuard` only, NO `SubscriptionTierGuard` (precedent: `GET /insights/safe-to-spend`, `GET /insights/wrapped`).
- **Pure layer takes `now` as an injected parameter** — never call `Date.now()` / `new Date()` argless inside `inflation-shield.util.ts` (repo convention; the service injects `new Date()`).
- **FX direction:** `getRatesSafe(base)` returns `rates` where `1 base = rates[X] X`, so `amount_in_base = amount / rates[from]` (matches `ai-tools.service.ts`). Unknown rate → exclude the amount and set `fxApproximate: true`.
- **Tunable constants** live in `SHIELD_DEFAULTS` in the util; the service overrides each from an env var (default values are the source of truth): `SHIELD_MIN_MONTHLY_RISE_PCT=5`, `SHIELD_MIN_CADENCE_DAYS=14`, `SHIELD_MAX_STOCK_WEEKS=8`, `SHIELD_MAX_UNITS=12`, `SHIELD_MIN_POINTS=3`, `SHIELD_HORIZON_WEEKS=4`.
- Tests: Jest, colocated `*.spec.ts`, run with `npx jest <pattern>` from `apps/api/`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/shared-types/src/dto/insights.ts` (modify) | `ShieldItem` + `InflationShieldResponse` DTOs | 1 |
| `apps/api/src/modules/insights/inflation-shield.util.ts` (create) | Pure forecast / stockpile / quantity / assemble math | 2–5 |
| `apps/api/src/modules/insights/inflation-shield.util.spec.ts` (create) | Unit tests for the pure util | 2–5 |
| `apps/api/src/modules/price-history/price-history.service.ts` (modify) | New public `getProductTrends()` over existing `fetchRows` | 6 |
| `apps/api/src/modules/price-history/price-history.service.spec.ts` (modify) | Test for `getProductTrends` | 6 |
| `apps/api/src/modules/insights/inflation-shield.service.ts` (create) | IO + assembly, Redis cache | 7 |
| `apps/api/src/modules/insights/inflation-shield.service.spec.ts` (create) | Service test (mocked deps) | 7 |
| `apps/api/src/modules/insights/insights.module.ts` (modify) | Register `InflationShieldService` | 7 |
| `apps/api/src/modules/insights/insights.controller.ts` (modify) | `GET /insights/inflation-shield` route | 8 |

---

### Task 1: Shield DTOs

**Files:**
- Modify: `packages/shared-types/src/dto/insights.ts` (append after the `AffordabilityVerdict` block, before the Wrapped section)

**Interfaces:**
- Produces: `ShieldItem`, `InflationShieldResponse` (consumed by the service in Task 7 and by mobile in Plan 3).

- [ ] **Step 1: Add the DTOs**

Append to `packages/shared-types/src/dto/insights.ts`:

```ts
// ── Inflation Shield (Plan 1) ──────────────────────────────
// Forecasts per-product prices from receipt history and recommends what to
// stock up on before it rises. All amounts are in the user's display currency.

export interface ShieldItem {
  canonicalName: string;
  monthlyChangePct: number;   // forecast, % per month (positive = rising)
  currentPrice: number;       // best current unit price, in baseCurrency
  projectedPrice: number;     // forecast unit price at the horizon, baseCurrency
  quantity: number;           // units to stock up now
  projectedSaving: number;    // (projectedPrice - currentPrice) * quantity, baseCurrency
  store: string | null;       // cheapest store (community) or null in Plan 1
  currencyOriginal: string;   // the product's native currency
  affordableToday: boolean;   // stock-up outlay <= projectedAvailable (safe-to-spend)
}

export interface InflationShieldResponse {
  baseCurrency: string;
  items: ShieldItem[];
  basketMonthlyForecastPct: number | null;  // weighted forecast across the basket
  totalProjectedSaving: number;
  savedSoFar: number;         // realized savings to date (0 until Plan 2 tracking ships)
  hasEnoughData: boolean;     // false + empty items below the data threshold
  fxApproximate: boolean;
  computedAt: string;         // ISO datetime
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/dto/insights.ts
git commit -m "feat(shared-types): add Inflation Shield DTOs"
```

---

### Task 2: `forecastProductTrend` (pure)

**Files:**
- Create: `apps/api/src/modules/insights/inflation-shield.util.ts`
- Create: `apps/api/src/modules/insights/inflation-shield.util.spec.ts`

**Interfaces:**
- Produces: `forecastProductTrend(points, now, opts?) => TrendForecast`, `TrendForecast`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/insights/inflation-shield.util.spec.ts`:

```ts
import { forecastProductTrend } from './inflation-shield.util';

const D = (iso: string) => iso; // points use ISO date strings

describe('forecastProductTrend', () => {
  const now = new Date('2026-07-15T00:00:00Z');

  it('flags a rising trend when the recent window is pricier than the prior window', () => {
    const points = [
      { date: D('2026-06-05'), price: 5.0 },  // prior window (4-8w ago)
      { date: D('2026-06-12'), price: 5.1 },
      { date: D('2026-07-03'), price: 5.6 },  // recent window (0-4w ago)
      { date: D('2026-07-10'), price: 5.8 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('rising');
    expect(f.monthlyChangePct).toBeGreaterThan(5);
  });

  it('returns flat/0 when either window is empty (silent on doubt)', () => {
    const points = [
      { date: D('2026-07-10'), price: 5.8 },  // only recent, no prior
      { date: D('2026-07-12'), price: 5.9 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('flat');
    expect(f.monthlyChangePct).toBe(0);
  });

  it('flags a falling trend', () => {
    const points = [
      { date: D('2026-06-05'), price: 6.0 },
      { date: D('2026-07-10'), price: 5.0 },
    ];
    const f = forecastProductTrend(points, now);
    expect(f.direction).toBe('falling');
    expect(f.monthlyChangePct).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.util -t forecastProductTrend`
Expected: FAIL — "Cannot find module './inflation-shield.util'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/insights/inflation-shield.util.ts`:

```ts
// Pure, unit-tested Inflation Shield math. `now` is always injected — never call
// Date.now()/new Date() argless here (repo convention).

const WEEK_MS = 7 * 86_400_000;

export interface TrendForecast {
  monthlyChangePct: number;                 // % per month (positive = rising)
  direction: 'rising' | 'falling' | 'flat';
  weeksObserved: number;
}

/**
 * Momentum forecast: mean price of the recent `recentWeeks`-week window vs the
 * window before it, expressed as a monthly change. Returns flat/0 when either
 * window is empty (conservative — no signal, no recommendation).
 */
export function forecastProductTrend(
  points: { date: string; price: number }[],
  now: Date,
  opts: { recentWeeks?: number; flatThresholdPct?: number } = {},
): TrendForecast {
  const recentWeeks = opts.recentWeeks ?? 4;
  const flat = opts.flatThresholdPct ?? 1;
  const pts = points
    .map((p) => ({ t: new Date(p.date).getTime(), price: p.price }))
    .filter((p) => Number.isFinite(p.t) && p.price > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return { monthlyChangePct: 0, direction: 'flat', weeksObserved: 0 };

  const weeksObserved = Math.round(((pts[pts.length - 1].t - pts[0].t) / WEEK_MS) * 10) / 10;
  const nowMs = now.getTime();
  const windowMs = recentWeeks * WEEK_MS;
  const recentCut = nowMs - windowMs;
  const priorCut = nowMs - 2 * windowMs;

  const recent = pts.filter((p) => p.t >= recentCut);
  const prior = pts.filter((p) => p.t >= priorCut && p.t < recentCut);
  if (recent.length === 0 || prior.length === 0) {
    return { monthlyChangePct: 0, direction: 'flat', weeksObserved };
  }

  const avg = (xs: { price: number }[]) => xs.reduce((s, x) => s + x.price, 0) / xs.length;
  const priorAvg = avg(prior);
  const recentAvg = avg(recent);
  const pct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
  const rounded = Math.round(pct * 10) / 10;
  const direction: TrendForecast['direction'] =
    rounded > flat ? 'rising' : rounded < -flat ? 'falling' : 'flat';
  return { monthlyChangePct: rounded, direction, weeksObserved };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest inflation-shield.util -t forecastProductTrend`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.util.ts apps/api/src/modules/insights/inflation-shield.util.spec.ts
git commit -m "feat(insights): forecastProductTrend momentum forecaster"
```

---

### Task 3: `estimateCadenceDays` + `isStockpileable` (pure)

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield.util.ts`
- Modify: `apps/api/src/modules/insights/inflation-shield.util.spec.ts`

**Interfaces:**
- Produces: `estimateCadenceDays(dates) => number | null`, `isStockpileable(cadenceDays, opts?) => StockpileVerdict`, `StockpileVerdict`.

- [ ] **Step 1: Write the failing tests**

Append to `inflation-shield.util.spec.ts`:

```ts
import { estimateCadenceDays, isStockpileable } from './inflation-shield.util';

describe('estimateCadenceDays', () => {
  it('returns the median gap in days for >=3 purchases', () => {
    const dates = [new Date('2026-06-01'), new Date('2026-06-15'), new Date('2026-06-29')];
    expect(estimateCadenceDays(dates)).toBe(14);
  });
  it('returns null below 3 purchases', () => {
    expect(estimateCadenceDays([new Date('2026-06-01'), new Date('2026-06-15')])).toBeNull();
  });
});

describe('isStockpileable', () => {
  it('rejects short-cadence perishables (milk bought every ~6 days)', () => {
    expect(isStockpileable(6).ok).toBe(false);
  });
  it('accepts long-cadence shelf-stable goods and caps the stock weeks', () => {
    const v = isStockpileable(30);
    expect(v.ok).toBe(true);
    expect(v.maxStockWeeks).toBe(8);
  });
  it('is silent when cadence is unknown', () => {
    expect(isStockpileable(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.util -t "estimateCadenceDays|isStockpileable"`
Expected: FAIL — imports not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `inflation-shield.util.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest inflation-shield.util -t "estimateCadenceDays|isStockpileable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.util.ts apps/api/src/modules/insights/inflation-shield.util.spec.ts
git commit -m "feat(insights): cadence estimate + stockpileability heuristic"
```

---

### Task 4: `recommendStockUp` (pure)

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield.util.ts`
- Modify: `apps/api/src/modules/insights/inflation-shield.util.spec.ts`

**Interfaces:**
- Produces: `recommendStockUp(input) => StockRecommendation`, `StockRecommendation`.

- [ ] **Step 1: Write the failing test**

Append to `inflation-shield.util.spec.ts`:

```ts
import { recommendStockUp } from './inflation-shield.util';

describe('recommendStockUp', () => {
  it('sizes quantity by consumption over the horizon and computes projected saving', () => {
    // cadence 7d => 1/week; horizon 4 weeks => 4 units; price 5 rising 12%/month
    const r = recommendStockUp({
      cadenceDays: 7,
      monthlyChangePct: 12,
      horizonWeeks: 4,
      currentBestPrice: 5,
      maxStockWeeks: 8,
      maxUnits: 12,
    });
    expect(r.quantity).toBe(4);
    expect(r.projectedPrice).toBeGreaterThan(5);
    expect(r.projectedSaving).toBeGreaterThan(0);
  });

  it('caps quantity at maxUnits', () => {
    const r = recommendStockUp({
      cadenceDays: 1, monthlyChangePct: 10, horizonWeeks: 4,
      currentBestPrice: 2, maxStockWeeks: 8, maxUnits: 12,
    });
    expect(r.quantity).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.util -t recommendStockUp`
Expected: FAIL — import not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `inflation-shield.util.ts`:

```ts
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
  const projectedSaving = Math.round((projectedPrice - currentBestPrice) * quantity * 100) / 100;
  return { quantity, projectedPrice, projectedSaving };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest inflation-shield.util -t recommendStockUp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.util.ts apps/api/src/modules/insights/inflation-shield.util.spec.ts
git commit -m "feat(insights): recommendStockUp quantity + saving math"
```

---

### Task 5: `assembleShield` (pure)

**Files:**
- Modify: `apps/api/src/modules/insights/inflation-shield.util.ts`
- Modify: `apps/api/src/modules/insights/inflation-shield.util.spec.ts`

**Interfaces:**
- Consumes: `forecastProductTrend`, `estimateCadenceDays`, `isStockpileable`, `recommendStockUp` (all from this file).
- Produces: `assembleShield(products, baseCurrency, rates, now, opts?) => AssembledShield`, `ShieldProductInput`, `AssembledShieldItem`, `AssembledShield`, `ShieldOpts`, `SHIELD_DEFAULTS`.

- [ ] **Step 1: Write the failing test**

Append to `inflation-shield.util.spec.ts`:

```ts
import { assembleShield } from './inflation-shield.util';

describe('assembleShield', () => {
  const now = new Date('2026-07-15T00:00:00Z');
  // Monthly-ish cadence (median gap ~15d >= 14) AND points in both forecast
  // windows (prior [May 20–Jun 17], recent [Jun 17–Jul 15]) so it is both
  // stockpileable and rising.
  const rising = {
    canonicalName: 'Masło',
    currency: 'PLN',
    points: [
      { date: '2026-05-25', price: 5.0 }, { date: '2026-06-08', price: 5.1 },
      { date: '2026-06-25', price: 5.7 }, { date: '2026-07-10', price: 5.9 },
    ],
    purchaseDates: [new Date('2026-05-25'), new Date('2026-06-08'), new Date('2026-06-25'), new Date('2026-07-10')],
    currentBestPrice: 5.9,
    store: null as string | null,
  };

  it('recommends a rising, stockpileable product', () => {
    const s = assembleShield([rising], 'PLN', null, now);
    expect(s.hasEnoughData).toBe(true);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].canonicalName).toBe('Masło');
    expect(s.items[0].projectedSaving).toBeGreaterThan(0);
    expect(s.totalProjectedSaving).toBeGreaterThan(0);
  });

  it('excludes a short-cadence perishable even if it is rising', () => {
    // Bought every 7 days (median gap 7 < 14) => not stockpileable, yet rising.
    const milk = {
      canonicalName: 'Mleko',
      currency: 'PLN',
      points: [
        { date: '2026-06-10', price: 3.0 }, { date: '2026-06-17', price: 3.0 },
        { date: '2026-06-24', price: 3.4 }, { date: '2026-07-01', price: 3.5 },
        { date: '2026-07-08', price: 3.6 }, { date: '2026-07-15', price: 3.7 },
      ],
      purchaseDates: [new Date('2026-06-10'), new Date('2026-06-17'), new Date('2026-06-24'),
                      new Date('2026-07-01'), new Date('2026-07-08'), new Date('2026-07-15')],
      currentBestPrice: 3.7,
      store: null as string | null,
    };
    const s = assembleShield([milk], 'PLN', null, now);
    expect(s.items).toHaveLength(0); // silent — never bulk-buy milk
  });

  it('hasEnoughData is false with no usable products', () => {
    const s = assembleShield([], 'PLN', null, now);
    expect(s.hasEnoughData).toBe(false);
    expect(s.items).toHaveLength(0);
  });

  it('flags fxApproximate and converts when the product currency differs from base', () => {
    const s = assembleShield([rising], 'USD', { PLN: 4 }, now); // 1 USD = 4 PLN
    expect(s.fxApproximate).toBe(true);
    // 5.9 PLN / 4 ≈ 1.48 USD
    expect(s.items[0].currentPrice).toBeCloseTo(1.48, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.util -t assembleShield`
Expected: FAIL — imports not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `inflation-shield.util.ts`:

```ts
export interface ShieldProductInput {
  canonicalName: string;
  currency: string;                 // product's native currency
  points: { date: string; price: number }[];
  purchaseDates: Date[];
  currentBestPrice: number;         // native currency
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
}

export const SHIELD_DEFAULTS: ShieldOpts = {
  minMonthlyRisePct: 5,
  minCadenceDays: 14,
  maxStockWeeks: 8,
  maxUnits: 12,
  minPoints: 3,
  horizonWeeks: 4,
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
      recentWeeks: opts.horizonWeeks,
      flatThresholdPct: 1,
    });

    // Basket-wide forecast: weight each product's monthly change by its base price.
    weightedSum += priceBase * forecast.monthlyChangePct;
    totalWeight += priceBase;

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
```

- [ ] **Step 4: Run the full util suite**

Run: `cd apps/api && npx jest inflation-shield.util`
Expected: PASS (all tasks 2–5 tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.util.ts apps/api/src/modules/insights/inflation-shield.util.spec.ts
git commit -m "feat(insights): assembleShield — filter, rank, FX, basket forecast"
```

---

### Task 6: `PriceHistoryService.getProductTrends`

**Files:**
- Modify: `apps/api/src/modules/price-history/price-history.service.ts` (add public method + exported interface; reuse the existing private `fetchRows`)
- Modify: `apps/api/src/modules/price-history/price-history.service.spec.ts`

**Interfaces:**
- Consumes: existing private `fetchRows(accountId): Promise<RawItemRow[]>` (same class).
- Produces: `getProductTrends(accountId): Promise<ProductTrendRow[]>`, exported `ProductTrendRow`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/price-history/price-history.service.spec.ts` (inside the existing `describe('PriceHistoryService', …)` — reuse the file's existing `prisma`/`service` setup):

```ts
  it('getProductTrends groups item rows into per-product price series', async () => {
    (prisma as any).productAlias.findMany.mockResolvedValue([]);
    (prisma as any).expenseItem.findMany.mockResolvedValue([
      { id: 'i1', canonicalName: 'Masło', unitPrice: 5.0, quantity: 1, totalPrice: 5.0,
        expense: { date: new Date('2026-06-05'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: null, locationLng: null } },
      { id: 'i2', canonicalName: 'Masło', unitPrice: 5.9, quantity: 1, totalPrice: 5.9,
        expense: { date: new Date('2026-07-10'), merchant: 'Lidl', currencyCode: 'PLN', locationLat: null, locationLng: null } },
    ]);
    const trends = await service.getProductTrends('a1');
    expect(trends).toHaveLength(1);
    expect(trends[0].canonicalName).toBe('Masło');
    expect(trends[0].points.map((p) => p.price)).toEqual([5.0, 5.9]);
    expect(trends[0].currentBestPrice).toBe(5.9); // latest
    expect(trends[0].currency).toBe('PLN');
    expect(trends[0].purchaseDates).toHaveLength(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest price-history.service -t getProductTrends`
Expected: FAIL — `service.getProductTrends is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/modules/price-history/price-history.service.ts`, add the exported interface near the top (after `RawItemRow`):

```ts
export interface ProductTrendRow {
  canonicalName: string;             // resolved name
  currency: string;                  // native currency of the latest purchase
  points: { date: string; price: number }[];   // sorted ascending by date
  purchaseDates: Date[];             // sorted ascending
  currentBestPrice: number;          // latest personal unit price
  latestMerchant: string;
}
```

Add the public method to the class (e.g. right after `getPriceHistory`):

```ts
  /**
   * Per-product price series over the account's full history, for the Inflation
   * Shield. Reuses fetchRows (alias resolution + per-unit price already handled).
   */
  async getProductTrends(accountId: string): Promise<ProductTrendRow[]> {
    const rows = await this.fetchRows(accountId);
    const byProduct = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byProduct.get(r.resolvedName) ?? [];
      arr.push(r);
      byProduct.set(r.resolvedName, arr);
    }
    const out: ProductTrendRow[] = [];
    for (const [name, items] of byProduct.entries()) {
      const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
      const latest = sorted[sorted.length - 1];
      out.push({
        canonicalName: name,
        currency: latest.currency,
        points: sorted.map((i) => ({ date: i.date.toISOString().slice(0, 10), price: i.unitPrice })),
        purchaseDates: sorted.map((i) => i.date),
        currentBestPrice: latest.unitPrice,
        latestMerchant: latest.merchant,
      });
    }
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest price-history.service -t getProductTrends`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-history/price-history.service.ts apps/api/src/modules/price-history/price-history.service.spec.ts
git commit -m "feat(price-history): getProductTrends per-product series"
```

---

### Task 7: `InflationShieldService` + module wiring

**Files:**
- Create: `apps/api/src/modules/insights/inflation-shield.service.ts`
- Create: `apps/api/src/modules/insights/inflation-shield.service.spec.ts`
- Modify: `apps/api/src/modules/insights/insights.module.ts` (add provider + export)

**Interfaces:**
- Consumes: `PriceHistoryService.getProductTrends`, `ExchangeRateService.getRates`, `SafeToSpendService.compute`, `CacheService`, `assembleShield` + `SHIELD_DEFAULTS`.
- Produces: `InflationShieldService.getShield(accountId, userId, baseCurrency): Promise<InflationShieldResponse>`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/insights/inflation-shield.service.spec.ts`:

```ts
import { InflationShieldService } from './inflation-shield.service';

describe('InflationShieldService', () => {
  // Monthly-ish cadence (>= 14d) + points in both forecast windows => stockpileable + rising.
  const risingProduct = {
    canonicalName: 'Masło',
    currency: 'PLN',
    points: [
      { date: '2026-05-25', price: 5.0 }, { date: '2026-06-08', price: 5.1 },
      { date: '2026-06-25', price: 5.7 }, { date: '2026-07-10', price: 5.9 },
    ],
    purchaseDates: [new Date('2026-05-25'), new Date('2026-06-08'), new Date('2026-06-25'), new Date('2026-07-10')],
    currentBestPrice: 5.9,
    latestMerchant: 'Lidl',
  };

  function make() {
    const priceHistory = { getProductTrends: jest.fn().mockResolvedValue([risingProduct]) };
    const exchange = { getRates: jest.fn().mockResolvedValue({ rates: { PLN: 1 } }) };
    const safeToSpend = { compute: jest.fn().mockResolvedValue({ projectedAvailable: 1000 }) };
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    const svc = new InflationShieldService(
      priceHistory as any, exchange as any, safeToSpend as any, cache as any,
    );
    return { svc, priceHistory, cache };
  }

  it('returns ranked recommendations with a free response shape', async () => {
    const { svc } = make();
    const res = await svc.getShield('a1', 'u1', 'PLN', new Date('2026-07-15T00:00:00Z'));
    expect(res.baseCurrency).toBe('PLN');
    expect(res.hasEnoughData).toBe(true);
    expect(res.items[0].canonicalName).toBe('Masło');
    expect(res.items[0].affordableToday).toBe(true);
    expect(res.savedSoFar).toBe(0); // Plan 2 wires realized savings
    expect(typeof res.computedAt).toBe('string');
  });

  it('serves from cache when present', async () => {
    const { svc, priceHistory, cache } = make();
    (cache.get as jest.Mock).mockResolvedValue({ baseCurrency: 'PLN', items: [], cached: true });
    const res: any = await svc.getShield('a1', 'u1', 'PLN');
    expect(res.cached).toBe(true);
    expect(priceHistory.getProductTrends).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest inflation-shield.service`
Expected: FAIL — "Cannot find module './inflation-shield.service'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/insights/inflation-shield.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PriceHistoryService } from '../price-history/price-history.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { SafeToSpendService } from './safe-to-spend.service';
import { CacheService } from '../../common/cache/cache.service';
import { assembleShield, SHIELD_DEFAULTS, ShieldOpts } from './inflation-shield.util';
import type { InflationShieldResponse, ShieldItem } from '@budget/shared-types';

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
  ) {}

  private opts(): ShieldOpts {
    return {
      minMonthlyRisePct: envNum('SHIELD_MIN_MONTHLY_RISE_PCT', SHIELD_DEFAULTS.minMonthlyRisePct),
      minCadenceDays: envNum('SHIELD_MIN_CADENCE_DAYS', SHIELD_DEFAULTS.minCadenceDays),
      maxStockWeeks: envNum('SHIELD_MAX_STOCK_WEEKS', SHIELD_DEFAULTS.maxStockWeeks),
      maxUnits: envNum('SHIELD_MAX_UNITS', SHIELD_DEFAULTS.maxUnits),
      minPoints: envNum('SHIELD_MIN_POINTS', SHIELD_DEFAULTS.minPoints),
      horizonWeeks: envNum('SHIELD_HORIZON_WEEKS', SHIELD_DEFAULTS.horizonWeeks),
    };
  }

  private async getRatesSafe(base: string): Promise<Record<string, number> | null> {
    try {
      const { rates } = await this.exchangeRate.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
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
    const rates = await this.getRatesSafe(baseCurrency);

    // Plan 1: personal-only (store: null). Community-boost is the first task of Plan 2.
    const assembled = assembleShield(
      trends.map((t) => ({
        canonicalName: t.canonicalName,
        currency: t.currency,
        points: t.points,
        purchaseDates: t.purchaseDates,
        currentBestPrice: t.currentBestPrice,
        store: null,
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

    const result: InflationShieldResponse = {
      baseCurrency,
      items,
      basketMonthlyForecastPct: assembled.basketMonthlyForecastPct,
      totalProjectedSaving: assembled.totalProjectedSaving,
      savedSoFar: 0, // Plan 2 wires realized-savings tracking
      hasEnoughData: assembled.hasEnoughData,
      fxApproximate: assembled.fxApproximate,
      computedAt: now.toISOString(),
    };

    await this.cache.set(cacheKey, result, 3600);
    return result;
  }
}
```

- [ ] **Step 4: Register the provider**

In `apps/api/src/modules/insights/insights.module.ts`, add the import and provider/export:

```ts
import { InflationShieldService } from './inflation-shield.service';
```

Add `InflationShieldService` to BOTH the `providers` array and the `exports` array (alongside `WrappedService`).

- [ ] **Step 5: Run test + typecheck**

Run: `cd apps/api && npx jest inflation-shield.service && npx tsc --noEmit`
Expected: tests PASS, tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/insights/inflation-shield.service.ts apps/api/src/modules/insights/inflation-shield.service.spec.ts apps/api/src/modules/insights/insights.module.ts
git commit -m "feat(insights): InflationShieldService assembly + Redis cache"
```

---

### Task 8: `GET /insights/inflation-shield` endpoint

**Files:**
- Modify: `apps/api/src/modules/insights/insights.controller.ts` (inject the service, add the route)

**Interfaces:**
- Consumes: `InflationShieldService.getShield`.
- Produces: HTTP route `GET /insights/inflation-shield` (free — no tier guard).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/insights/insights.controller.shield.spec.ts`:

```ts
import { InsightsController } from './insights.controller';

describe('InsightsController — inflation-shield route', () => {
  it('passes accountId, userId and display currency to the service', async () => {
    const shield = { getShield: jest.fn().mockResolvedValue({ items: [], baseCurrency: 'PLN' }) };
    // Only the shield dependency matters for this route; others can be undefined.
    const ctrl = new InsightsController(
      undefined as any, undefined as any, undefined as any,
      undefined as any, undefined as any, undefined as any, shield as any,
    );
    const req: any = { accountId: 'a1', user: { id: 'u1', currencyCode: 'PLN' } };
    const res = await ctrl.getInflationShield(req);
    expect(shield.getShield).toHaveBeenCalledWith('a1', 'u1', 'PLN');
    expect(res.baseCurrency).toBe('PLN');
  });
});
```

> NOTE: the constructor argument order/count must match the real controller. Before writing Step 3, read the current `InsightsController` constructor and place `InflationShieldService` as the LAST injected dependency; update the `new InsightsController(...)` argument list in this test to match (pad the earlier positions with `undefined as any`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest insights.controller.shield`
Expected: FAIL — `ctrl.getInflationShield is not a function`.

- [ ] **Step 3: Add the route**

In `apps/api/src/modules/insights/insights.controller.ts`:
1. Import the service: `import { InflationShieldService } from './inflation-shield.service';`
2. Add `private readonly inflationShieldService: InflationShieldService` as the LAST constructor parameter.
3. Add the route (mirror the free `safe-to-spend` / `wrapped` routes — `JwtAuthGuard + AccountContextGuard` are already class-level; add NO `SubscriptionTierGuard`):

```ts
  /**
   * GET /insights/inflation-shield
   * Forecasts per-product prices and recommends what to stock up on before it
   * rises. No tier guard — FREE (retention/virality), same precedent as safe-to-spend.
   */
  @Get('inflation-shield')
  async getInflationShield(@Req() req: AuthenticatedRequest) {
    const baseCurrency = req.user.currencyCode || 'USD';
    return this.inflationShieldService.getShield(req.accountId, req.user.id, baseCurrency);
  }
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd apps/api && npx jest insights.controller.shield && npx tsc --noEmit`
Expected: tests PASS, tsc exit 0.

- [ ] **Step 5: Full-suite regression**

Run: `cd apps/api && npx jest src/modules/insights src/modules/price-history`
Expected: all PASS (no existing insights/price-history tests broken).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/insights/insights.controller.ts apps/api/src/modules/insights/insights.controller.shield.spec.ts
git commit -m "feat(insights): GET /insights/inflation-shield (free)"
```

---

## Definition of Done (Plan 1)

- `GET /insights/inflation-shield` returns `InflationShieldResponse` for the authenticated account, free of tier gating.
- Pure util fully unit-tested (forecast, cadence, stockpileability, quantity/saving, assembly incl. FX + perishable exclusion + `hasEnoughData`).
- Personal-only data path; util is community-ready via the optional `store`/`currentBestPrice` fields.
- No migration, no LLM cost, no mobile changes.
- `savedSoFar` returns 0 (wired in Plan 2).

## Follow-ups (next plans)

- **Plan 2:** community-boost wiring (region → `CommunityPriceService`, sets `store` + lowers `currentBestPrice`); `inflation_shield_recommendations` migration + `user.notifyInflationShield`; `reconcilePurchase` realized-savings hook in `ExpensesService.create`; `inflation-shield.cron.ts` daily push + `notification-i18n` (9 langs).
- **Plan 3:** mobile `inflationShieldStore` + `useInflationShield` + Shield screen + home widget + shopping-list "buy ahead" strip + share card; `get_inflation_shield` AI chat tool + `ShieldResult` card; `inflationShield.*` i18n × 9.
