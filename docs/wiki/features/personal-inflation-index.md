# Personal inflation index

*Hub: [analytics-insights](../analytics-insights.md) · related:
[inflation-shield](inflation-shield.md), [receipt-price-check](receipt-price-check.md),
[community-prices](community-prices.md)*

## What this is

Price history per product per store, built from OCR'd receipt line items, and a personal
Laspeyres inflation index over the products this user actually buys. Free for every tier.

## Entry points

- `apps/api/src/modules/price-history/` — service, controller, `canonical-name-parse.util.ts`
- `apps/api/src/modules/ai/services/ocr.service.ts` — the `canonicalName rules` prompt block and
  `buildCanonicalNameFallback`
- Mobile: `apps/mobile/src/stores/priceHistoryStore.ts`, `src/services/priceHistory.api.ts`,
  `src/components/analytics/InflationIndexSection.tsx`, `app/settings/products.tsx`

## Key concepts

**A product is its `canonicalName`.** OCR fills `expense_items.canonical_name` (NULL for manual
items). The model **keeps** per-unit weight/volume, fat or alcohol percentage and flavour, and
**strips** only pack multipliers, product codes and PLU numbers: "MLEKO 3,2% ŁACIATE 1L 6SZT" →
"Mleko Łaciate 3,2% 1L". Size is never stripped — do not assume a canonical name is
size-agnostic. When the model gives none, `buildCanonicalNameFallback` takes up to three meaningful
tokens.

**Aliases override, and merging is sharing an alias.** `product_aliases` (unique on
`[accountId, rawName]`) holds user renames; names resolve as
`COALESCE(alias.canonicalName, item.canonicalName)`, and two raw names merge by pointing at the
same alias.

**The index.** `Σ(weight × priceChangePct) / Σ(weight)` with `weight = baseAvgPrice ×
purchaseCountInBase`; base period `[now − 2p, now − p]`, current `[now − p, now]` on calendar-month
boundaries; majority currency by row count. `null` below three products.

**Discount lines fold into the discount (ABA-343).** Some receipts print each discount on its own
line and the model emits them as negative items. `extractReceiptDiscounts` (`modules/ai/utils/receipt-discount.ts`) pulls a line only when it
is **negative AND** carries a discount label in one of the supported languages — the negative gate
stops a positive product with a label-like brand name from being pulled — and folds it into
`parsed.discount` as `max(existing, Σ pulled)`. The paid total is never touched.

## Invariants

**`PriceHistoryProduct.rawName` carries the pre-alias key** so a rename always updates the right
alias row.

**User aliases are never overwritten** by the AI backfill (`POST /price-history/products/backfill-ai`,
ABA-308), which regenerates names only for NULL or single-word entries, deduplicated, 50 per batch,
at most 500 per call.

**Static routes before `/:rawName`** in the controller. Writes (alias, merge, backfill) are behind
`ViewerBlockGuard`; the mobile edit affordances are `canEdit`-gated.

**`canonicalName` is persisted on both write paths** — `ExpensesService.create()` and
`SyncService`.

## Known gaps

- Discount folding is forward-only; existing rows keep their negative discount lines.
- `GET /price-history` is cached for 5 minutes per account and period, so a new receipt can take
  that long to move the index.

## History

ABA-307 · ABA-308 (AI backfill) · ABA-343 (discount-line folding).
