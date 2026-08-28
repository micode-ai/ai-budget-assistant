# Receipt Category Auto-Split — Design

> v1 shipped 2026-08-12. Three parts of it did not survive contact with real
> receipts and were corrected on 2026-08-28; the affected sections below have
> been rewritten to describe what is actually built, and **Revisions after v1**
> at the end records what changed and why.

One scanned supermarket receipt currently lands as a single category. A 240 zł
Biedronka trip is "Groceries", even though it is really 180 groceries + 35
household chemicals + 25 alcohol. This design makes the receipt's own line items
decide the categories, so the analytics answer a question no manual-entry
competitor can answer at all.

## Why this is defensible

The ingredients are already collected and then discarded. `expense_items.canonicalName`
has been populated by OCR since ABA-307 for the Personal Inflation Index; nothing
reads it for categorization. `ExpenseCategorySplit` (`expenseId` + `categoryId` +
`amount` + `percentage`) is a shipped table with a shipped editor (`SplitEditor`),
and `analytics.service.ts` already prefers splits over the expense's own category.

So the work is not "build a classifier and a split system" — both exist. It is
"connect them, make the arithmetic trustworthy, and learn from corrections."

## What is already built and dead

`apps/api/src/modules/ai/services/split-suggestion.service.ts` implements
`suggestSplits()`, including an item-based branch. `POST /ai/suggest-splits` is
registered in `ai.controller.ts` (guarded by `AiUsageGuard`, tracked at cost 1.0),
and `api.suggestSplits` exists in `apps/mobile/src/services/ai.api.ts`.

**It has zero call sites.** No screen, store, or bot calls it. The feature is
half-built and invisible.

It also carries a defect that must not survive into v1: the model is asked to
return `"amount": number` per category, i.e. **the LLM does the money arithmetic**.
This repo has already settled that question in the opposite direction — in the AI
statement import (ABA-390) "the model never emits an amount or a date on the CSV
path — it returns column names", validated against the file's real headers. The
same invariant applies here.

The service is rewritten rather than deleted: its prompt shape is a useful
skeleton, but its contract with the model changes.

## Locked decisions (from brainstorming)

1. **Analytics only.** Splits change charts and breakdowns. They do NOT count
   against category budgets. `budgets.service.ts`, `budget-alert.service.ts`,
   `SafeToSpendService` and the `get_budget_status` AI tool are untouched, and the
   expense keeps a single `categoryId` (the dominant category) for them to read.
   This matches how manual splits already behave — no new inconsistency is introduced.
2. **Pre-filled, not opt-in.** The split arrives already computed on the receipt
   confirmation screen, editable in one tap. Bots apply it and report it as a line
   in their reply. A button nobody presses would leave the differentiator invisible,
   which is the status quo.
3. **Free, outside the monthly AI quota.** Precedent: AI import inference in
   ABA-390. The ceiling is a per-account daily Redis counter, not `usage_logs`
   (whose only writer is `trackAiUsage`). Rationale: this is a showcase surface, and
   the free tiers of safe-to-spend / Wrapped / Inflation Shield are deliberate.

### Non-goals for v1

- Budget integration (decision 1).
- Backfill of already-scanned receipts. Forward-only, same as the receipt discount
  folding in ABA-343.
- A hand-written Polish product dictionary. See "No static dictionary" below.
- Splits for bank/Wise imports or manual entry — neither has line items.
- Tier-2 (fully E2EE) accounts — the server cannot read encrypted line items.

## Classifier

Chain, cheapest first:

1. **Per-account rules** — `product_category_rules`, keyed on the receipt's own
   **printed line** (`ExpenseItem.description`), normalized to letters and digits
   only. NOT on the model's `canonicalName` — see Revisions.
2. **LLM** for whatever the rules do not cover.

The LLM's output is written back into the rules **when the expense is saved**,
from the category it actually saved with — not at scan time, or a scan the user
abandons would teach the cache. A repeat purchase is then free.
In a grocery basket that is nearly everything: people buy the same products every
week. This is what keeps the "free, outside quota" decision affordable.

### The model never emits money

Input: the receipt's line items (index + label, where the label is
`canonicalName` falling back to `description`) and the account's expense category
**names**.

Two strings per line, for two different jobs: the **label** goes to the model,
where a clean product name genuinely reads better, while the **rule key** is the
printed line. `ClassifyLine.label` and `ClassifyLine.ruleKey` are separate fields
for exactly this reason.

Output: `[{ itemIndex, categoryName }]`. Nothing else. No amounts, no percentages,
no totals.

The server then:
- rejects any `categoryName` that is not in the list it supplied (exact,
  case-insensitive match against a `Set` — the AI-import validator's rule: an
  object map would make every `Object.prototype` key a false positive);
- rejects any `itemIndex` outside `[0, items.length)`;
- maps names to ids and sums the amounts itself.

An invented category name or index drops that one item (it stays unassigned),
never the whole response — unlike the import mapping, a partial result here is
still useful.

### No static dictionary

The obvious cost-saver is a hand-written PL keyword map (`piwo → Alcohol`), a
sibling of `MERCHANTS_PL`. Deliberately not done: the per-account rule cache,
populated by the model's own output, should reach the same steady state within a
shopping trip or two — without a hundred lines of hand-maintained vocabulary and
without the PL bias that already fragments non-Polish merchants in
`normalizeMerchantPL`.

That claim was untested when written, and under the original key it was simply
false: one receipt scanned twice produced 22 rules and then 33 more **with no key
in common**. Measured again after the key changed, a fourth scan of the same
receipt matched 27 of the 32 existing rules and created 4. The remaining misses
are lines whose printed text the OCR itself reads differently between scans
(`JajaŚcioł` / `JajaKlSol`), which no normalization can reconcile — fuzzy matching
was considered and deliberately not taken.

### Budget and failure behaviour

- Daily ceiling per account: Redis key `aisplit:{accountId}:{YYYY-MM-DD}`, limit
  from `AI_SPLIT_MAX_INFERENCES_PER_DAY` (default 20), NaN-guarded the same way
  `parseInferenceQuotaEnv` guards the import counter. Exhausted ⇒ rules only.
- Fail-silent by contract: any throw ⇒ `[]` + `logger.warn`, mirroring
  `runPriceCheck`. A receipt scan must never break because categorization failed.
- The counter increments only after a successful classification.

## Arithmetic — a pure, unit-tested function

This is the one place where the feature can silently corrupt numbers the user
already trusts, so the invariant is explicit.

`analytics.service.ts` groups by splits **instead of** the expense's category when
splits exist (line 218), but computes the period total separately from
`expense.amount` (line 194). The mobile side is built the same way
(`useCategoryAnalytics` derives its total from expense amounts). Therefore if the
splits do not sum to the expense amount, the total stays correct while **the
breakdown stops adding up to it and every percentage is wrong**.

**Invariant: Σ split amounts === expense amount, exactly, to the cent.**

The difficulty is that Σ line items is rarely equal to the receipt total —
discounts, deposits, non-itemized fees, and OCR misses all break it.
`parsed.amount` is the OCR `total` and is never adjusted (ABA-343). Rules:

- Two of those differences are *known* and are allowed for before the gate is
  applied. A **discount** is money taken off after the lines were priced: the
  lines stay gross and only the total reflects it. A **deposit** (Polish
  `kaucja`, returnable packaging) runs the other way: it is printed in its own
  block, never as a line item, yet the amount due includes it. So the gate
  measures `|Σitems − discount + deposit − amount| / amount`.
- If that exceeds `SPLIT_TOLERANCE_PCT` (default 5%), **emit no split at all**.
  Refusing is honest; smearing an unexplained difference across categories is
  not.
- Only the known discount is spread across the groups, in proportion to what each
  contributed. The deposit is not: it belongs to whichever lines the bottles were
  on, and guessing which is worse than leaving it in the residual.
- Within tolerance, the residual goes deterministically to the largest group —
  the same shape as `resolveShares` in `trip-share-calculator.ts`, where the last
  participant absorbs the residual cent.
- Fewer than 2 distinct categories ⇒ no split; that is an ordinary expense.
- `percentage` is computed from `amount` (the denominator that
  `ExpenseCategorySplit.percentage Decimal @db.Decimal(5,2)` implies), after the
  residual has been assigned, so percentages sum to 100.

Pure, `now`-free, no Prisma import — same shape as `receipt-check.util.ts` and
`inflation-shield.util.ts`.

Both runtimes need it: the server computes the split at scan time, and the mobile
receipt screen recomputes the groups when the user reassigns a line. They must
agree to the cent, so it is a **deliberately duplicated pair**, the same
arrangement as `financial-month.ts`:

- canonical copy: `apps/api/src/common/utils/receipt-category-split.ts`
- mirror: `packages/shared-utils/src/formatting/receipt-category-split.ts`

It cannot be a single shared import. The API has no build step for workspace
packages, so a runtime `import` of `@budget/shared-utils` from `apps/api/src`
crash-loops production with `ERR_UNSUPPORTED_DIR_IMPORT` — which is why
`scripts/check-no-shared-utils-runtime-import.sh` fails the deploy on the runner
before it can ship, and why an `apps/api` ESLint rule mirrors it. (Note that
`computeSafeToSpend` is often described as living in shared-utils; in fact the API
imports its own `insights/safe-to-spend.util.ts` copy and only the spec file
reaches for the shared one.) Same case table on both sides — change one, change
the other.

## Re-reading a receipt that does not add up

The gate above assumes a bad reading is rare. It is not: extraction is **not
reproducible**. The same Biedronka PDF, the same prompt, four scans — line totals
of 345.16, 294.28, 311.97 and 306.05 against a true 299.82, and the printed
`OPUSTY ŁĄCZNIE: -70,34` read as 70.34 three times and 18.97 once. Two of those
four scans refused to split, for two unrelated reasons.

So rather than requiring the model to be right every time, `OcrService.readReceipt`
asks the receipt's own arithmetic whether the reading holds and, when it does not,
re-issues the **identical** request once and keeps whichever reading reconciles.
An identical request on purpose: what is wanted is a second independent sample,
not a differently-worded question.

- All four scan paths (image, text-PDF, both PDF-as-file branches) go through this
  one choke point, so a fifth inherits it — the same property `finalizeReceipt`
  gives the price check and the split itself.
- A tie, or a second reading that cannot be measured, keeps the first: a re-read
  can rescue a scan, never degrade one. A re-read that throws keeps the first too.
- The extra call is only ever spent on a scan already headed for no split.
- The decision is pure and unit-tested in `modules/ai/utils/receipt-reconcile.ts`;
  the service calls, the util decides.

**Deliberately not done**: deriving the discount from `Σitems − total`. That makes
every reading reconcile by construction — including the one that over-read the
basket by 45 — and destroys the only signal that a reading is bad.

## Storage

Two migrations, no backfill.

**`expense_items.category_id`** — nullable, FK to `categories`, `onDelete: SetNull`
(matching `BudgetAlert.categoryId`, the existing nullable-category-FK precedent).
Two jobs: explainability (tap a chip → see which lines produced it) and
re-deriving a split after a rule changes **without another LLM call**.

**`product_category_rules`** — a structural mirror of `merchant_category_rules`:

| column | note |
|---|---|
| `accountId` | scope |
| `canonicalNameNormalized` | `canonicalName.trim().toLowerCase()` |
| `categoryId` | FK, cascade-deleted with the category, like merchant rules |
| `createdAt` / `updatedAt` | |

`@@unique([accountId, canonicalNameNormalized])`. Written by upsert, from both a
successful LLM classification and a user correction — a correction simply
overwrites, so the user always wins over the model.

## Transport — one funnel, three consumers

`ReceiptExpense` gains `categorySplits: ReceiptCategorySplit[]`, **always present,
empty when there is nothing to report** (the `priceFindings` rule from ABA-373 —
an always-present array cannot be forgotten by a consumer).

```ts
interface ReceiptCategorySplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];   // which receipt lines produced this group
}
```

Computed in `OcrService.finalizeReceipt`, next to `runPriceCheck`:

```ts
const receipt = await this.buildReceiptExpense(parsed, categories);
receipt.priceFindings  = await this.runPriceCheck(accountId, receipt);
receipt.categorySplits = await this.runCategorySplit(accountId, receipt);
```

`finalizeReceipt` is the single funnel every scan path already goes through (its
own doc comment says so). Putting the classifier anywhere else means the next scan
path silently loses it.

### Mobile

`expense/receipt.tsx` renders the split as an editable chip row above the item
list ("Groceries 180 · Household 35 · Alcohol 25"). Tapping it opens a sheet
listing every line with its assigned category; changing a line's category
recomputes the groups locally through the mirrored pure function described above,
so the edited numbers match what the server would have produced.

On save, `addExpense` sends `splits` (already supported — `expenseStore.addExpense`
accepts and persists them, and `ExpensesService.create` resolves them at line 267)
plus `items[].categoryId`. Every line the user reassigned upserts a rule — exactly
how `ExpensesService.update()` upserts a merchant rule after a category change.

### Bots

All three `photo.handler.ts` pass `splits` into `expensesService.create()` and
append one line to the reply, built by a shared `buildCategorySplitLine` helper in
each bot's `helpers/i18n.ts` (9 languages each). Empty splits ⇒ empty string ⇒ the
reply is byte-identical to today's.

## Mobile analytics — without this the feature is invisible

The Analytics tab computes client-side from SQLite and ignores splits entirely:
`useCategoryAnalytics` groups strictly by `expense.categoryId`, and splits are only
ever read one expense at a time (`getSplitsForExpense`). They never reach memory.

Changes:
- `loadExpenses` hydrates splits for the loaded set (one query, not per-row) and
  attaches them to the in-memory expense.
- `useCategoryAnalytics` uses splits when present, both for the current period and
  for the trailing-months `vsAverage` computation — otherwise the delta compares a
  split month against unsplit history and reports a fake drop.
- Totals (`useSummaryAnalytics`, `useFilteredTransactions`) are untouched: they sum
  expense amounts, which do not change.

Accepted limitation: the server-side `AnomalyService.detectCategorySpike` keeps
grouping by `categoryId`, so a spike in a split-only category will not fire. Noted
as a follow-up rather than silently pretended away.

## Edge cases

- **Receipt with one category** — no split rows; ordinary expense.
- **Σ items far from the total** — no split (tolerance rule above).
- **Item with no `canonicalName`** — falls back to `description`; if both are
  empty the line is unassigned and its amount stays with the dominant category.
- **Category deleted later** — split rows cascade-delete with the category exactly
  as they do today; `product_category_rules` cascade too, mirroring merchant rules.
- **Offline scan** — the classification is part of the scan response, so an offline
  device has no splits; the expense saves normally with its single category.
- **E2EE tier-2** — skipped before any LLM call.
- **Viewer role** — cannot save anyway; the split is display-only for them.

## Testing

- `receipt-category-split.util.spec.ts` — the arithmetic: exact-sum invariant,
  residual assignment, the tolerance refusal, the <2-categories refusal,
  percentages summing to 100, cent-level rounding.
- Classifier validation — invented category name dropped, out-of-range
  `itemIndex` dropped, whole-response failure ⇒ `[]`.
- `ocr.service.spec.ts` — `categorySplits` always present; a classifier throw
  leaves the scan result otherwise intact.
- Rule learning — a corrected line upserts a rule; the next receipt uses it
  without an LLM call.
- Mobile — `useCategoryAnalytics` with and without splits, including the
  trailing-month path.

## Follow-ups (explicitly out of v1)

- Category budgets counting splits fractionally.
- `detectCategorySpike` honouring splits.
- A global, non-PII `canonicalName → system category` dictionary so the second user
  of a product pays nothing, mirroring `bank_statement_signatures`.
- Re-deriving splits for historical receipts after rules accumulate (the reason
  `expense_items.category_id` exists).
- Learning a rule from an item category change made outside the receipt screen.

## Revisions after v1

v1 shipped on 2026-08-12. What follows was found by scanning one real Biedronka
receipt repeatedly on 2026-08-27/28 and reading the production database; each
item corrected a claim above rather than adding a feature.

**ABA-440 — deposits, and line values the model invented.** A 33-line receipt
with four correctly identified categories produced no split. Two causes: the
`OPAKOWANIA ZWROTNE` deposit block was charged to the tolerance (4.50 on a 233.98
receipt, 1.9% before anything else went wrong), and the model returned
internally-consistent `quantity × unitPrice = totalPrice` triples in which every
number was wrong — `1 × 10,49` came back as `10 × 4.09 = 40.90`. The gate learned
about deposits; the prompt learned that the printed value column is copied, never
computed, and that `Σlines − discount + deposit` must reconcile with the total.
Line sum moved from 345.16 to 294.28 against a true 299.82.

**ABA-441 — the rule key.** `canonicalName` is invented per scan and is not
stable (`piwo carlsberg 0,5l` one day, `carlsberg 0,5l` the next), so the cache
never hit, every scan paid the model, and contradictory rules accumulated. The
key became the receipt's printed line, normalized to letters and digits only, and
the existing rows — dead under the new scheme — were dropped by migration.

**ABA-442 — the re-read.** See the section above. Prompt wording had removed one
class of error and left the variance, which is what actually decided whether a
receipt split.

Where this leaves the feature, measured on the fourth scan of that receipt: gap
0.7% against the total, split emitted, no re-read needed, and 27 of 32 rule keys
matched.
