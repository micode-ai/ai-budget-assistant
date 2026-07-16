# Inflation Shield — Design (v1)

> **Elevator pitch:** the app forecasts the price of *your specific products* from your receipt history + the crowdsourced price corpus, and tells you what to stock up on **now** before it rises — with a concrete product, quantity, store, and projected zł saved. Over time it shows "the Shield saved you X zł."

This feature only exists because we simultaneously have three things no competitor has together:
1. **Your basket at line-item level** (receipt OCR → `expense_items.canonical_name`) — what, how much, how often, at what price.
2. **Price series per product × store × week** (personal `PriceHistoryService` + crowdsourced `CommunityPriceService`).
3. **Consumption cadence** (`predictRestock` already knows "you buy milk ~every 6 days").

Banks see only "Biedronka 154 zł". Retailers never say "buy at a competitor". A new entrant has no receipt corpus. This is pure monetization of the existing data moat — but shipped **free** to maximize retention + virality.

## Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| **v1 scope** | Full: actionable recommendation **+** realized-savings tracking **+** AI chat tool **+** shopping-list integration |
| **Data source** | Hybrid — personal history is the core (trend + consumption); community prices are a booster (confirm trend earlier, pick cheapest store even where the user never shopped). Degrades gracefully to personal-only when community is thin/dark. |
| **Monetization** | Fully free |

**Free-vs-Pro boundary (deliberate):** community prices are Pro-gated only at the *endpoint* layer (`CommunityPriceController` + `@RequireTier('pro')`). The Shield calls `CommunityPriceService` **server-side inside itself** and returns only a *derived per-product signal* (a trend confirmation and a single cheapest-store price for one product). The full community browser / product search / store map stay Pro. The Shield respects the `COMMUNITY_PRICE_READ_ENABLED` kill-switch and falls back to personal-only when community reads are off or below k-anonymity.

## No new AI cost

All forecasting is deterministic momentum math (pure functions). No LLM calls in the hot path. The only LLM touch is the *optional* existing product-name canonicalization already done at OCR time — unchanged.

---

## Section 1 — Surfaces (what the user sees)

The engine output feeds several thin surfaces; the same `getShield()` response drives all of them.

- **Shield screen** `app/inflation-shield/index.tsx` (primary): hero *"The Shield saved you X zł"* → basket forecast for next month *(+N%)* → per-product cards: *"Butter is rising +12% → buy 6 at Lidl for 5.49, save ~18 zł."* Shareable card (same zero-native-module pattern as Wrapped's `WrappedShareCard`).
- **Home widget** `inflationShield` (new `WidgetKey`, added to `HomeWidgetSwitch.tsx`): top 1–2 recommendations + running savings counter; tap → screen. Hidden when `hasEnoughData === false`.
- **Push** `inflation_shield`: fired once when a product first crosses the "rising" threshold **and** is stockpileable → *"Butter is rising — stock up now, save ~18 zł."* Deep-links to the screen. Gated by `user.notifyInflationShield` (default true), deduped per product per month.
- **Shopping-list strip** "Buy ahead": a strip on `app/shopping-list/index.tsx` (mirrors the existing restock/deals strips) — tap adds K units to the active list.
- **AI chat tool** `get_inflation_shield` (read action, executes immediately, cached): *"what should I stock up on?"* → narrated answer + a `ShieldResult` `ActionResultCard`.

**Minimal spine** = Shield screen + engine + endpoint. Widget / push / strip / chat are thin wrappers over the same `getShield()` output.

## Section 2 — Engine (pure logic, `insights/inflation-shield.util.ts`)

Mirrors `safe-to-spend.util.ts` / `wrapped.util.ts`: a pure, unit-tested module the service assembles. `now` is always injected (no `Date.now()` in the pure layer, per repo convention). All tunable constants have env overrides (like the community module).

- **`forecastProductTrend(pricePoints, communityPoints, now)` → `{ monthlyChangePct, direction: 'rising'|'falling'|'flat', weeksObserved, confidence }`**
  Momentum: compare the mean unit price of a recent window against the prior window, normalized to **%/month**. Personal `pricePoints` are the base; community median points (when available) are blended in as extra observations to detect the rise earlier. Deterministic. *(Regression/seasonality rejected — too few points per product; overkill.)*

- **`estimateConsumptionPerWeek(purchases)` → `number | null`**
  Reuses the `predictRestock` cadence (median gap between purchases, ≥3 points) → purchases/week. `null` when insufficient history.

- **`isStockpileable(cadenceDays, opts)` → `{ ok, maxStockWeeks, reason }`**
  Conservative cadence heuristic: `ok` only when `cadenceDays >= SHIELD_MIN_CADENCE_DAYS` (default 14 — automatically excludes milk/bread bought every few days), and `maxStockWeeks = min(SHIELD_MAX_STOCK_WEEKS, …)`. **Silent on doubt** (returns `ok: false` when cadence is unknown). *(Static category lists — brittle across 9 languages; LLM classification — needless cost. Cadence + cap chosen.)*

- **`recommendStockUp({ consumptionPerWeek, monthlyChangePct, horizonWeeks, currentBestPrice, maxStockWeeks })` → `{ quantity, projectedPrice, projectedSaving }`**
  `quantity = clamp(ceil(consumptionPerWeek × min(horizonWeeks, maxStockWeeks)), 1, SHIELD_MAX_UNITS)`; with `horizonMonths = horizonWeeks / 4.345`, `projectedPrice = currentBestPrice × (1 + monthlyChangePct/100 × horizonMonths)`; `projectedSaving = (projectedPrice − currentBestPrice) × quantity`. `currentBestPrice` = the lower of the user's latest personal price and the community cheapest-store price (when available).

- **`assembleShield(products, communityByProduct, baseCurrency, rates, now, opts)` → `{ items: ShieldItem[], basketMonthlyForecastPct, totalProjectedSaving, hasEnoughData, fxApproximate }`**
  Keeps only products that are **rising ≥ `SHIELD_MIN_MONTHLY_RISE_PCT`** (default 5%/month), **stockpileable**, and have **≥ `SHIELD_MIN_POINTS`** (default 3) points. Sorts by `projectedSaving` desc. FX-converts every amount to the user's `currencyCode` via `convertAmount` (unknown rate → excluded from sums, sets `fxApproximate`). `basketMonthlyForecastPct` = weighted forecast across the user's tracked basket (same weighting shape as the inflation index). `hasEnoughData === false` (empty `items`) below the point/data threshold — the Shield stays silent rather than inventing.

**Constants (env-tunable):** `SHIELD_MIN_MONTHLY_RISE_PCT=5`, `SHIELD_MIN_CADENCE_DAYS=14`, `SHIELD_MAX_STOCK_WEEKS=8`, `SHIELD_MAX_UNITS=12`, `SHIELD_MIN_POINTS=3`, `SHIELD_HORIZON_WEEKS=4`.

## Section 3 — Data, architecture, risks

### Architecture (mirrors safe-to-spend / wrapped)

- **Pure util** `apps/api/src/modules/insights/inflation-shield.util.ts` — the four functions above, fully unit-tested.
- **Service** `apps/api/src/modules/insights/inflation-shield.service.ts` — IO + assembly. Reuses:
  - `PriceHistoryService` — new **public** `getProductTrends(accountId)` (thin wrapper over the existing private `fetchRows`) returning per-product sorted price series + latest-per-store. Avoids duplicating the alias-resolution / per-unit-price logic.
  - `predictRestock` (shopping-list) for cadence.
  - `CommunityPriceService.getCommunityPrices(product, region, period)` server-side (kill-switch + k-anon respected).
  - `SafeToSpendService` — flags whether the one-off stock-up outlay is affordable today (advisory `affordableToday` flag on each item; never blocks the recommendation).
  - `getRatesSafe` / `convertAmount` for FX.
- **Endpoint** `GET /insights/inflation-shield` (`JwtAuthGuard + AccountContextGuard`, **no tier guard — free**, precedent: safe-to-spend/wrapped). Redis cache `shield:{accountId}:{baseCurrency}` TTL ~1h.
- **Module wiring:** `InsightsModule` already imports `PriceHistoryModule`, `GamificationModule`; add whatever is needed for `CommunityPriceService` + `predictRestock` without creating a cycle (community lives under `price-history`; if a cycle appears, provide a second `GeocodingService`-style instance as the community module already does).

### Data model (one migration)

- **`inflation_shield_recommendations`** — snapshot for realized-savings tracking:
  `id`, `accountId`, `canonicalName`, `recommendedAt`, `priceAtRec`, `projectedPrice`, `qty`, `projectedSaving`, `currencyCode`, `status ShieldStatus` (`active|acted|expired`), `actedAt?`, `realizedSaving?`, `@@unique([accountId, canonicalName, periodMonth])` (dedup one active rec per product per month). Holds no PII beyond accountId + product label.
- **`user.notifyInflationShield Boolean @default(true)`** — notification preference (added to `GET/PATCH /users/me/notification-preferences`, `notification-i18n.ts`, and the mobile notifications settings toggle).

Persisting happens as a side effect of *surfacing*: when `getShield()` (or the cron) surfaces a recommendation, it upserts an `active` row (fire-and-forget). The live computation itself is stateless — the table exists only for savings attribution.

### Realized-savings tracking

Hook in `ExpensesService.create` post-create block (alongside anomaly / familyFeed / community, via `@Optional()` injection + `void …catch(()=>{})`): `InflationShieldService.reconcilePurchase(accountId, expenseId)` — for each new receipt item matching an `active` recommendation's `canonicalName`, if `qty ≥ rec.qty` and unit price `≤ rec.priceAtRec`, mark `acted` and credit the saving.

**v1 attribution:** credit the **projected** saving as realized on the act (simple + honest — "you followed the advice"). "The Shield saved you X" = `Σ realizedSaving` over `acted` rows. True realized savings (verify the price *actually* rose later) is a follow-up.

### Cron

`inflation-shield.cron.ts` (`0 10 * * *`, mirrors `shopping-reminder.cron.ts`): iterate accounts with recent price history, compute the shield, and for any *newly* stockpileable-rising product not alerted this month → push `inflation_shield` (per-type gate) + upsert the recommendation. Dedup key `shield:{accountId}:{canonical}:{YYYY-MM}`.

### Mobile

- `inflationShieldStore.ts` (server-only, MMKV-cached, mirrors `priceHistoryStore`).
- `useInflationShield` hook + `inflation-shield.api.ts`.
- Home widget `InflationShieldWidget` + new `'inflationShield'` `WidgetKey` (in `HomeWidgetSwitch.tsx`, respects widget order/visibility).
- Screen `app/inflation-shield/index.tsx` (+ header registration + route in `_layout.tsx`) with the shareable card.
- Shopping-list "Buy ahead" strip.
- `ShieldResult` case in `ActionResultCard.tsx` for the chat tool.
- Push deep-link `inflation_shield → /inflation-shield`.
- `inflationShield.*` i18n keys across all **9** locales (en/de/es/fr/pl/ru/ua/be/nl); `notifications.inflationShield*` toggle; `chat.actionInflationShield`; `notification-i18n.ts` push copy in 9 langs.

### AI chat tool

`get_inflation_shield` added to `ChatActionType`, `AiToolsService` (schema + executor calling `InflationShieldService`), `ai.module.ts` imports `InsightsModule` (already does — SafeToSpendService lives there), routed as a **read action** through `handleReadAction` (cached, narrated). Prompt-builder gets a one-line instruction ("what should I buy ahead / stock up on" → `get_inflation_shield`).

### Testing

- Pure util: `inflation-shield.util.spec.ts` — forecast direction/magnitude, stockpileable excludes short-cadence (milk), quantity clamp + shelf cap, saving math, assemble sorting/FX/`hasEnoughData`.
- Service + reconcile + cron: Jest suites (mock Prisma), like the shopping-list/anomaly specs.

### Risks & mitigations

1. **Stockpileability correctness** (primary — must never tell someone to bulk-buy milk): conservative cadence threshold + shelf cap + silent-on-doubt. Perishables with short cadence are excluded automatically.
2. **Sparse data:** `hasEnoughData` gate (≥3 points/product) — empty shield, never fabricated numbers.
3. **Forecast ≠ guarantee:** all copy framed as "forecast / approx", like the `fxApproximate` pattern.
4. **Free community exposure:** only a derived single-product signal leaves the server; full explorer/map stay Pro; kill-switch + k-anon respected.
5. **Cron cost** iterating accounts: mirror `shopping-reminder.cron`'s per-account query shape; only accounts with recent price history.

## Out of scope / follow-ups

- **True realized savings** (verify the price actually rose after the stock-up) — v1 credits projected saving on the act.
- **Seasonality-aware forecast** (holiday spikes) — v1 is momentum-only.
- **Per-litre / per-kg normalization** (canonical_name strips size → exact-match only, inherited limitation).
- **Multi-store split** ("buy butter at Lidl, coffee at Biedronka") — v1 picks one best store per product.
- **"Kasowy kontroler"** (receipt vs shelf/last price mismatch alert) and **"Zakupowy autopilot"** (weekly shop plan) — separate features noted during ideation.
