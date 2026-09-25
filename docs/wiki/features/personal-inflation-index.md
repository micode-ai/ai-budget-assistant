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
  `src/components/analytics/InflationIndexSection.tsx`, `app/settings/products.tsx` →
  `src/components/settings/products/ProductsSettings.tsx`, which delegates its rename and merge
  state to `src/hooks/useProductRename.ts` / `src/hooks/useProductMerge.ts` (ABA-593) — a new
  rename/merge feature on this screen extends one of those two hooks, not the screen inline
- `src/components/analytics/ProductDetailSheet.tsx` — the trend-chart + cheapest-store content,
  hosted by TWO chromes: `InflationIndexSection`'s own hand-rolled sheet/dialog, and (ABA-588)
  `src/components/settings/ProductDetailModal.tsx`'s `SheetDialog`

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

**Two ways to reach a product's detail, on two different data sources (ABA-588).**
`InflationIndexSection`'s top-3-movers list opens `ProductDetailSheet` from a `PriceHistoryProduct`
already in `GET /price-history?period=X`'s `products[]` — which only includes a product with
purchases on BOTH sides of that period's base/current midpoint (needed for `priceChangePct`).
Settings → Products' full, unfiltered catalog (`GET /price-history/products`, no such gate) opens
the SAME `ProductDetailSheet`, but sourced from a separate, narrower endpoint,
`GET /price-history/products/:canonicalName/detail` → `PriceHistoryService.getProductDetail`,
which groups the account's full item history for that one product with no qualification at all.
This is why the search screen needed a new endpoint rather than reusing `getPriceHistory`: a
product bought once, or bought a few times all on one side of every period's midpoint (the common
case right after a first purchase), can never appear in `products[]` for ANY period, not even
`all` — a single purchase timestamp is always on exactly one side of a split point.
`getProductDetail` restricts to the product's own majority currency (not the account-wide one
`getPriceHistory` uses), and fills `priceChangePct`/`baseAvgPrice`/`currentAvgPrice` best-effort
(whole-history split at the midpoint) purely to satisfy the shared type — `ProductDetailSheet`
never reads those three fields.

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

ABA-307 · ABA-308 (AI backfill) · ABA-343 (discount-line folding) · ABA-588 (search →
detail on Settings → Products; the `getProductDetail` endpoint with no base/current gate) ·
ABA-593 (`ProductsSettings.tsx` regrowth after ABA-478's modal extraction — rename/merge state
moved into `useProductRename`/`useProductMerge` hooks; pure refactor, no behavior change).
