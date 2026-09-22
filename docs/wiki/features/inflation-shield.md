# Inflation Shield

*Hub: [analytics-insights](../analytics-insights.md)*

## What this is

Forecasts each tracked product's price from receipt history and recommends what to **stock up on
now** before it rises — product, quantity, store, estimated saving — plus how much the shield has
saved so far. Deterministic, **no LLM cost**, free for every tier.

## Entry points

- `apps/api/src/modules/insights/inflation-shield.util.ts` — pure, unit-tested:
  `forecastProductTrend`, `estimateCadenceDays`, `isStockpileable`, `recommendStockUp`,
  `assembleShield`
- `apps/api/src/modules/insights/inflation-shield.service.ts`
- `inflation-shield-tracking.service.ts` — a Prisma-only leaf in its own tiny module
- `inflation-shield-notify.cron.ts`
- `apps/mobile/src/stores/inflationShieldStore.ts`, `app/inflation-shield/index.tsx`

Migration: `inflation_shield_recommendations` (+ the `ShieldStatus` enum), authored **DB-free** via
`prisma migrate diff`, since this repo runs migrations against prod through the deploy migrator.

## Key concepts

**The engine.** Least-squares regression over a 12-week window with a `minSpanDays` guard and a
`hasSignal` flag; a cadence estimate; a conservative stockpileable test; and a quantity capped by
horizon and by an absolute maximum. All env-tunable via `SHIELD_*`.

**`projectedSaving` is HALVED** — a linear-ramp avoided-cost model, `(projected − current) / 2 × qty`,
not the full end-gap. It is an estimate and the copy must frame it as one.

**Tracking realized savings.** `recordRecommendations` is idempotent per
`(accountId, canonicalName, periodMonth)` — first-of-month snapshot wins, create and catch P2002
**outside** any transaction. `reconcilePurchase` marks a matching active recommendation `acted` and
credits its proportional saving.

## Invariants

**The tracking service is a leaf in its own module**, imported by both `InsightsModule` and
`ExpensesModule`. That is what keeps it cycle-free.

**`isStockpileable` is silent on unknown cadence.** Short-cadence perishables are excluded, and a
product whose cadence cannot be estimated is not guessed at.

**The forecast replaced a two-fixed-window momentum test**, which killed recall on exactly the
infrequently-bought goods this feature exists for.

**Match on `canonicalName` exactly, with a calendar-day date gate**, and **never** compare prices
across currencies. `expense.date >= floor(recommendedAt)` so a same-day purchase counts.

**Bust both caches on a new expense.** `ExpensesService.create` fire-and-forgets `reconcilePurchase`
AND invalidates `shield:` plus `chat:get_inflation_shield:`, so a new expense never serves a stale
shield.

**`get_inflation_shield` is a READ action** — not in `isWriteAction` — so it rides the cached,
narrated read path. Its prompt states the numbers verbatim, frames savings as an **estimate**, and
reports every amount in `baseCurrency` rather than per-item `currencyOriginal`.

**The push reports the forecast percentage, never the money estimate.** The body names the product
and a rounded `monthlyChangePct` only, to avoid overpromising a halved figure.

**One push per account per product per calendar month**, keyed `shield:{canonicalName}:{YYYY-MM}`
through the shared dedup ledger, with a daily cleanup of rows older than 90 days.

**The cron resolves the account owner's userId and currency**, then gates each member by their own
notification preference — the owner-lookup pattern shared with the subscription auto-charge cron.

**A new `WidgetKey` needs an entry in the settings label map too.** `WIDGET_KEYS`, the switch case
and `settings/widgets.tsx`'s `Record<WidgetKey, string>` are three places, and the last one is
exhaustive.

## Known gaps

- Community-boost (region → cheapest store) is implemented in the util but **not wired**, because
  production community reads are off behind their own kill switch pending anti-Sybil work.
- No true realized-savings verification and no expiry cron.
- Aliased products are not reconciled.
- Per-litre/kg normalization is impossible while `canonicalName` keeps pack size as an opaque token.

## History

ABA-346 (five sequenced plans; spec
`docs/superpowers/specs/2026-07-15-inflation-shield-design.md`) · ABA-353 (the share-image mechanism
extracted from what had been a byte-faithful duplicate) · ABA-371 (the proactive push).
