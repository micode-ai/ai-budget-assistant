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
- Mobile: `apps/mobile/src/components/chat/ActionResultCard.tsx` — `ExpensesResult` (tap-through)

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
no answer). Two consequences, both handled: with a category filter `get_expenses` reads page after
page of 500 (`CATEGORY_SCAN_PAGES` = 10, so up to 5 000 rows, a warning when the cap is what stopped
it) — one page cut a lifetime total down to the account's 500 newest expenses (ABA-714); and `count`
comes from the filtered rows, never `pagination.total`.
`categoryTotals` is attributed per split while `totalsByCurrency` stays what was actually paid.

**The model returns integer line indices, never UUIDs.** Small models mangle 36-character ids, which
silently dropped nearly every match. `parseMatchedIndices` clamps to `[1, count]`. On model error the
filter degrades to substring-only — **never** "return everything".

**The matched set is the single source of truth** for `matchedExpenses`, `recentExpenses`, `count`,
`totalsByCurrency` and `categoryTotals`, so the card, the narration and the total cannot disagree.

**Every rendered row resolves to a real expense id (ABA-605).** `ExpensesResult` taps a row through
to `/expense/:id`, resolving `expenseId ?? id` — `recentExpenses`/`expenses` rows carry the expense
id directly under `.id`, while `matchedExpenses` (the `buildSearchUnits` shape) carries it under
`.expenseId` since `.id` there can be a line-item id instead. This is the one place the two row
shapes must be reconciled by the mobile component; a fix to one shape without the other silently
breaks tap-through for whichever query path wasn't touched.

**Keyword queries default to full history.** Dates are optional in the schema and the prompt tells
the model to omit them unless the user names a period — "use today's date" produced a narrow window
and "found nothing".

**A named category without a period is a lifetime question too (ABA-714).** "How much have I spent
on renovation in total" reached `get_expenses` as `categoryName` with no dates, and a dateless,
keywordless call defaulted to the current month — the chat answered with November's 5.70 and called it
"all time", then repeated the same call when told it was wrong. Now a resolved `categoryName` or a
`descriptionKeyword` without `startDate` searches from `ALL_TIME_START`; only a call naming neither
(and a category name that matches nothing) keeps the current-month default. The schema tells the
model to describe the period from the returned `startDate`/`endDate`, never from the question, and to
re-call with new dates when the user says the period was wrong.

**Pass the user's raw wording.** The filter prompt interprets typos, slang, inflections and any
language (`пиво`/`пивка`/`beeer`/`cerveza` → Polish `Piwo …`); translating or correcting upstream
loses that.

## Known gaps

- Recall is bounded by the 1 500-unit cap (logged when exceeded), and a category total by the 5 000-row
  scan cap.
- A dateless "how much on groceries" now answers for the whole history rather than this month — a
  deliberate choice (ABA-714): the answer states its period, and a lifetime figure called a month is
  the worse failure.
- Discount lines that predate OCR's discount folding were not backfilled.

## History

ABA-343 (item search) · ABA-446 (split-aware categories) · ABA-529 (budgets follow) · ABA-605
(rows tappable through to their expense detail screen) · ABA-714 (dateless category questions
search the full history; category filter reads every page up to a cap).
