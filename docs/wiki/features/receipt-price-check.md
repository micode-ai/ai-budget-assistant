# Receipt price check

*Hub: [analytics-insights](../analytics-insights.md) · related: [receipt-category-split](receipt-category-split.md)*

## What this is

After a receipt is scanned, every line is compared against the **median** of what this user
previously paid for that product **at that same store** within a 12-week window. Lines costing
measurably more are reported so the user can act while still at the register. Deterministic — no
LLM in the hot path, no migration.

## Entry points

- `apps/api/src/modules/price-history/receipt-check.util.ts` — `checkReceiptPrices`,
  `groupReceiptLines`, `median`, `perUnitPrice`, `resolveReceiptCheckConfig`
- `apps/api/src/modules/price-history/price-history.service.ts` — `getProductTrendsFor`
- `OcrService.finalizeReceipt` — the inline scan-time call
- `AnomalyService.detectPriceOvercharge` — the post-create alert
- `apps/mobile/src/components/receipt/PriceFindingsCard.tsx`

Spec `docs/superpowers/specs/2026-07-25-receipt-price-check-design.md`; rollout
`docs/ops/receipt-price-check-rollout.md`.

## Key concepts

**Median, not mean**, so one promo-priced purchase in history cannot manufacture a finding.

**Gates, all env-tunable `RECEIPT_CHECK_*`:** 12-week lookback, ≥2 points, ≥15% rise, ≤100% rise
(above that, assume a different pack size and drop it, counted in `stats.droppedByCap`), ≥1.00
minimum amount, at most 5 findings by amount. Plus same-merchant and same-currency — **never any FX**.

**One engine, two call sites.** `finalizeReceipt` runs it inline at scan time for all four scan
paths and all three bots; `detectPriceOvercharge` persists one alert row afterwards. Both must agree,
which is what `excludeExpenseId` below is for.

**`priceFindings` is always present** — an empty array, never `undefined` — so every scan surface
gets it for free.

## Invariants

**Positioning, binding on all copy in all languages.** The data cannot prove a promotion failed to
apply: no discount line means no evidence a promotion existed. Nothing may say "overcharged",
"cheated" or "promo not applied" — only "more expensive than usual, worth checking".
`overpaidAmount` is an internal field name; keep it internal.

**Pass `excludeExpenseId`.** `ExpensesService.create` commits before firing `checkExpense`, so
without it the detector counts **the receipt under examination** as its own history: one prior at 20
plus this one at 30 means the inline pass finds nothing while the detector invents a baseline of 25
and upgrades `confidence` to `high`. The "both passes agree" claim is false without it, and
`receipt-check.util.cross-path.spec.ts` is the test that guards it.

**Key history by the RAW line name, not the alias-resolved one.** The engine looks up the raw name,
so keying history by the resolved one meant any renamed or merged product yielded zero findings
forever, silently.

**Group by name AND currency.** Grouping by name alone mixed two currencies into one series.

**Reject a `NaN` unit price explicitly.** Every `NaN` comparison is false, so it passed every gate
and produced "about NaN PLN more" in the bot reply.

**There is no pack-size gate, and adding one would be wrong.** The original spec assumed
`canonicalName` strips pack size and planned a `size` equality gate; that premise was false —
`canonicalName` KEEPS per-unit size, so different pack sizes are already different products and
never match in the name lookup. The field and gate were built, were unreachable because nothing
populated `size`, and were removed as dead code.

**`runPriceCheck` is fail-silent**: any throw yields `[]` plus a `logger.warn`. A scan must not fail
because a price comparison did.

**The alert never pushes.** `CreateAlertInput.skipPush` is a discriminated union — so a future
detector cannot silently forget its push functions — and it returns **before** the daily-cap query,
so a feed-only row cannot consume the push budget.

**`getProductTrendsFor` is a narrow sibling of `getProductTrends`**, which reads the account's entire
item history and must never touch the scan hot path. Merchant and currency are matched in JS beside
each other, because the stored merchant is a display name.

**The bot line has no plural support.** `t()` in the bots cannot inflect, so the count sits after a
label (`товаров: {{count}}`) rather than before an agreeing noun. Do not "fix" it back.

## Known gaps

- `RECEIPT_CHECK_ALERTS_ENABLED` is **off** in production. It gates only the alert *write*; the
  detector still runs and logs what it would have written. Flipping it is blocked on an actual store
  rollout of the build that renders the real card — before that, `alerts/index.tsx`'s `default:`
  branch would show installed apps a card titled `price_overcharge` with an empty body.
- Community prices are implemented and unit-tested as a fallback baseline but **not service-wired**,
  because production community reads are off behind their own kill switch.
- No per-litre/kg normalization: that needs a *parsed* size — value, unit and conversion — not a raw
  token.
- No index on `expense_items.canonical_name`.
- No real *saved* counter; that would need a dispute or refund flow to prove the user acted.

## History

ABA-373 (API, plan 1) and the mobile plan 2 that made the release gate flippable — the
`price_overcharge` card, the per-currency "found overpayments" total on the analytics inflation
section (**never a blended total**: summing would require FX, which this feature forbids), and the
`receiptCheck.*` strings in nine locales.
