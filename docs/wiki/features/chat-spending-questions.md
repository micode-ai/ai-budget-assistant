# Chat spending questions

*Hub: [ai-features](../ai-features.md) · related: [receipt-category-split](receipt-category-split.md),
[budgets](budgets.md), [deposit-and-discount-totals](deposit-and-discount-totals.md)*

## What this is

How the AI chat answers "how much did I spend on X" — by category (`get_expenses` with
`categoryName`, `get_category_breakdown`) and by product (`get_expenses` with `descriptionKeyword`,
which searches receipt line items).

## Entry points

- `apps/api/src/common/utils/category-attribution.ts` — `attributeToCategories` · mirror
  `packages/shared-utils/src/formatting/category-attribution.ts`
- `apps/api/src/modules/ai/services/ai-tools.service.ts` — `executeGetExpenses`,
  `executeGetCategoryBreakdown`
- `apps/api/src/modules/ai/utils/semantic-filter.ts` — `buildSearchUnits`, `parseMatchedIndices`,
  `deterministicMatchIndices`
- `apps/api/src/modules/ai/services/chat.service.ts` — `semanticFilterExpenses`

## Key concepts

**Category attribution follows the splits (ABA-446).** When an expense has category splits, the
splits decide and its own `categoryId` is ignored; with none, its own category takes the whole
amount. Both category tools read `attributeToCategories`, so they cannot drift apart — they had, and
the chat answered "nothing" for a category that existed only as a split (deposits, alcohol,
household) while the Analytics tab showed a number. Budgets use the same rule (ABA-529).

**Product search works on line items (ABA-343).** The tool flattens each receipt into searchable
units — one per line item (`amount = totalPrice`), else one per expense — FX-converted and capped at
`SEARCH_UNIT_LIMIT` (1 500). A cheap model picks matching units, unioned with a deterministic
same-script substring pass. A beer line inside a 150 zł receipt contributes only its own price.

## Invariants

**`categoryName` is resolved but NOT pushed into the SQL filter.** `expenses.category_id` can never
match a split-only category, so matching happens in memory over the attribution, and a filtered row
reports **only its matching share** (4.50, not the receipt's 233.98 — the whole total is worse than
no answer). Two consequences, both handled: the `limit: 500` page cap now bites before the filter (a
full page logs a warning), and `count` comes from the filtered rows, never `pagination.total`.
`categoryTotals` is attributed per split while `totalsByCurrency` stays what was actually paid.

**The model returns integer line indices, never UUIDs.** Small models mangle 36-character ids, which
silently dropped nearly every match. `parseMatchedIndices` clamps to `[1, count]`. On model error the
filter degrades to substring-only — **never** "return everything".

**The matched set is the single source of truth** for `matchedExpenses`, `recentExpenses`, `count`,
`totalsByCurrency` and `categoryTotals`, so the card, the narration and the total cannot disagree.

**Keyword queries default to full history.** Dates are optional in the schema and the prompt tells
the model to omit them unless the user names a period — "use today's date" produced a narrow window
and "found nothing".

**Pass the user's raw wording.** The filter prompt interprets typos, slang, inflections and any
language (`пиво`/`пивка`/`beeer`/`cerveza` → Polish `Piwo …`); translating or correcting upstream
loses that.

## Known gaps

- Recall is bounded by the 1 500-unit cap (logged when exceeded).
- Discount lines that predate OCR's discount folding were not backfilled.

## History

ABA-343 (item search) · ABA-446 (split-aware categories) · ABA-529 (budgets follow).
