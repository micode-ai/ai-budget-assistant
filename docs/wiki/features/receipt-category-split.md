# Receipt category auto-split

*Hub: [ai-features](../ai-features.md) · [api](../api.md)*

## What this is

Splits a scanned supermarket receipt's own line items across expense categories — a 240 zł
Biedronka trip becomes 180 groceries + 35 household + 25 alcohol instead of one "Groceries" blob.
Computed once at scan time inside the OCR funnel: no new endpoint, and no LLM in any write path.

Not to be confused with [receipt-split](receipt-split.md), which divides a bill between *people*.
Its mobile i18n namespace is `receiptCategorySplit`, never `receiptSplit`.

## Entry points

- `apps/api/src/modules/ai/services/receipt-category-split.service.ts` — `classify()`, the
  model call, proposal validation, `DEPOSIT_CATEGORY_NAMES`
- `apps/api/src/modules/merchant-rules/product-rules.service.ts` — `ProductRulesService`,
  `normalizeProductName`
- `apps/api/src/common/utils/receipt-category-split.ts` — canonical `buildCategorySplits`
- `packages/shared-utils/src/formatting/receipt-category-split.ts` — its mirror
- `apps/api/src/common/utils/deposit-category.ts` — `isDepositCategoryName`, `depositCategoryName`
- `apps/mobile/app/expense/receipt.tsx` + `src/hooks/useReceiptCategorySplit.ts` — the confirm card

Migrations: `20260812120000_add_expense_item_category`, `20260812120001_add_product_category_rules`,
`20260828120000_reset_product_category_rules`, `20260829080000_delete_deposit_product_rules`.

## Key concepts

**Classification chain, cheapest first.** `classify()` answers from per-account learned rules
first (`product_category_rules`, keyed by `normalizeProductName`), and sends only the lines the
rules did not cover to GPT. Every model answer is written back as a rule, which is why this is
free enough to sit outside the monthly AI quota.

**The model never emits money.** It receives each line's index plus label and the account's
category *names*, and returns `[{itemIndex, categoryName}]` only — no amount, percentage or total
anywhere in the exchange. The response is validated against a `Set` of the account's real names
(case-insensitive — not an object map, whose `Object.prototype` keys would be false positives) and
the real `[0, items.length)` index range; anything invented or out of range is silently dropped.

**Ceiling.** `AI_SPLIT_MAX_INFERENCES_PER_DAY` (default 20, NaN-guarded) is a per-account daily
Redis counter, deliberately outside the monthly AI usage quota. A rule hit never counts against it,
and the counter increments only after a model call actually returns — a thrown call leaves it
untouched, so a failure does not burn the day's budget.

**Arithmetic.** `buildCategorySplits` groups lines by resolved category so the group cent-values
sum to the receipt total's cent-value exactly, by integer-cents construction. It is a deliberately
duplicated pair (canonical in `apps/api`, mirror in `shared-utils`) for the same reason as
`financial-month.ts`: the API has no build step and cannot import `@budget/shared-utils` at runtime.

**Two known, opposite adjustments.** A basket `discount` is money off after the lines were priced
(lines are gross, total is net) and is spread proportionally across item groups, with the residual
assigned to the largest. A returnable-packaging `deposit` (Polish *kaucja*) is printed in its own
block below the goods total, never as a line item, yet is included in the amount paid — it is
**never** spread and never absorbs the residual, because it is an exact printed figure and
guessing which lines the bottles were on is worse than leaving it alone.

**The deposit is its own split group**, appended after the discount-spread and residual steps, and
it counts toward the two-group minimum — so a receipt that is otherwise entirely groceries now
splits into groceries plus deposit. Its category name comes from `DEPOSIT_CATEGORY_NAMES`, resolved
from the **account owner's** language (via `findFirst` filtered on `role: 'owner'`, never sorted —
alphabetically `editor` precedes `owner`), so a shared account converges on one deposit category
regardless of who scanned.

**Category proposals.** When no existing category fits, the model may return
`newCategories: [{name, lines}]`. `validateProposals` holds them to the same never-trust-only-drop
posture: the name must normalize to 2–30 characters containing at least one letter, must not match
an existing category or an already-accepted proposal, and each line number must be in range and
unclaimed. An **assignment always wins a contested line**, because `validateAssignments` runs first
and seeds the `claimed` set. At most `MAX_PROPOSED_CATEGORIES` (3) survive one scan; the length
check sits at the top of the loop, so a 4th valid proposal is dropped outright. Names are requested
in the account owner's language, not generated in English and translated after.

**Standard names first, and no forced fits (ABA-601).** The prompt lists the default category
names (`getDefaultCategories`, owner language, expense-type, deposit and already-present names
removed) as the preferred names for a proposal, and says a category that only shares a generic word
with a product (“Zakupy …”) is not a fit. Before this, “everything else goes in assignments” made the
model file groceries into a renovation account's building-supplies category rather than propose one.

**The overall category must agree with the split (ABA-601).** `reconcileReceiptCategory`
(`apps/api/src/modules/ai/utils/receipt-overall-category.util.ts`), called from
`finalizeReceipt`, ranks a learned merchant rule over the split over the scan model's single guess:
if the largest non-deposit group is a proposal, the receipt gets no category and the proposal's name
as its suggestion; if the guess is not one of the split's groups, the largest existing group wins.
The scan model's “null if none fits” is routinely ignored, so it is never trusted alone when there is
per-line evidence.

**Two sentinel prefixes, never confused.** The server groups a proposal under `proposed:<name>`
inside `runCategorySplit` alone, rewriting it to `categoryId: null` before anything leaves the
function. The mobile client separately holds the same idea as `new:<name>` in local screen state.
Neither is ever a DTO field or a stored value.

## Invariants

**The rule key is the receipt's printed line (`ExpenseItem.description`), never the model's
`canonicalName`.** `canonicalName` is invented per scan and is not stable: one Biedronka receipt
scanned on consecutive days taught 22 rules and then 33 more **with no key in common**, leaving
contradictory pairs whose winner is an accident of spelling, and paying the model again every scan.
Both sides must use the same field — `ClassifyLine.ruleKey` reads it, `LearnableExpenseItem.ruleKey`
writes it. `normalizeProductName` strips everything that is not a letter or digit; the class is
Unicode-wide, not `a-z`, so a Cyrillic line does not normalize to the empty string, and `ł` is
handled explicitly because NFD does not decompose it.

**Nothing may file a receipt LINE into the deposit category.** The deposit category is a real row,
so it sat in the list handed to the classifier like any other, and the model filed cured ham, bacon
and peanuts under *Kaucja* — then the save-time learner wrote those as rules, making the mistake
deterministic and self-re-teaching. `classify()` splits its input into assignable and deposit
categories via `isDepositCategoryName`: deposit ones are kept out of the prompt AND out of
`validCategoryIds`, so an existing poisoned rule is ignored rather than honoured. Recognition
matches **all nine** locale names, never just the owner's current language — an owner can switch
language and a shared account can change owner, but a category keeps the name it was born with.

**The deposit is never routed through `proposals`**, so it never has to clear the 10%
`MIN_PROPOSAL_SHARE_PCT` floor. A deposit is typically 1–2% of a receipt and would be dropped every
time, which would have made the whole feature silently never appear.

**Refuse rather than smear.** No split is emitted when the usable lines are further than the 5%
tolerance from the receipt total, or when fewer than two categories would result. Refusing is the
honest answer; within tolerance the residual goes to the largest group rather than inventing a
category for it.

**`depositAmount` must be written at all three `ExpensesService` sites** — create, the create-upsert
update branch, and `update()` — the same three-site pattern `location` needed. **And it must be
listed in `findAll`'s explicit `select`**: that method selects fields one by one (unlike `findOne`,
which uses `include`), so a field omitted there is simply absent from every list response. Native
papers over it from local SQLite; web and any second device show it missing while it sits in Postgres.

**Rule learning happens at save time only.** The scan-time learner was deleted because it taught
rules from a scan regardless of whether the user ever saved it. `ExpensesService.create()` is the
single writer, keyed off the RESOLVED per-item `categoryId`. All three bots must pass
`items[].categoryId`, without which a bot-confirmed receipt resolves its proposal into a real
category but never teaches the rule.

**The list of names to create is read from the SPLITS, not from the line→category map.**
`seedItemCategories` writes a key only for indexes in a split's `itemIndexes`, and the deposit
group's is empty by construction — so a list built from the map skipped the deposit's proposal and
sent the raw `new:Kaucja` sentinel to the API, where `resolveExpenseCategoryId` minted a category
literally named `new:Kaucja` that every later scan then reused. The bots were always correct here,
so left unfixed the app and the bots would mint two different categories for the same thing.

**Nothing creates a category at scan time.** The sole creators are the mobile save handler and each
bot's confirm branch, both only once the user has explicitly confirmed — a scan the user abandons
must not plant a category.

**The model is re-read once when a receipt does not add up.** Extraction is not reproducible: the
same PDF and prompt gave line totals of 345.16, 294.28 and 311.97 against a true 299.82.
`OcrService.readReceipt` — the single choke point all four scan paths go through — re-issues the
identical request once when `reconciliationGapPct` fails, and keeps the better read. A tie or an
unmeasurable second reading keeps the first, so a re-read can only rescue a scan, never degrade one.
Deliberately NOT deriving the discount from `Sum(lines) − total`: that makes every reading reconcile
by construction, destroying the only signal that a reading is bad.

**Aim the re-read by the SIGN of the gap.** An over-read gets pack-notation guidance; an
**under-read gets price guidance**, because a pack multiplier can only ever inflate a sum. The old
wording always blamed the quantity column and so sent the second pass to re-check the one column
already right.

**A discount the lines already reflect is dropped.** `isDiscountAlreadyInLines` clears a `discount`
only when the lines reconcile WITHOUT it and fail WITH it — the narrow inverse of the derivation
above, so it can only ever drop a figure the lines contradict, never invent one. It exists because
the tax-exclusive form `subtotal − discount + tax = total` is satisfied identically when the model
reports the VAT line as a discount, so the earlier checks actively **blessed** that case.

**Log exactly one `[CategorySplit]` line per outcome** — `few_lines`, `no_categories`,
`no_assignments`, `one_category`, `refused_by_arithmetic`, or `ok groups=N proposed=M`. The original
production failure (a 30-line receipt, three legitimate categories, zero split, zero error) had to
be diagnosed by reading database tables. `refused_by_arithmetic` is the honest catch-all for the
three ways `buildCategorySplits` can return `[]`; a single specific-sounding label would be
confidently wrong two times out of three.

## Known gaps

- **The scan prompt may now return no category at all.** `ocr.service.ts`'s `suggestedCategory`
  field can answer `null` when nothing genuinely fits, instead of forcing the nearest wrong pick;
  `receipt-finalizer.service.ts` already mapped a missing suggestion to `categoryId: null`. Cleaning
  up what that leaves uncategorized is a separate, after-the-fact pass — see
  [categorize-uncategorized](categorize-uncategorized.md).
- **Encryption.** `discountAmount` is in `ENCRYPTION_FIELDS.expense.tier2` but `depositAmount` is in
  **neither** tier and is not fed into `maybeEncrypt`, so a tier-2 account stores its deposit in
  clear. That partially leaks the encrypted `amount`: a deposit is a fixed per-unit charge, so its
  plaintext bounds the bottle count. Closing it means adding the field to `tier2` **and** to both
  `maybeEncrypt` call sites, in one change — the tier list alone would zero the plaintext with
  nothing encrypting it.
- A user can still hand-assign a line to the deposit category in `ItemCategorySheet`, producing a
  second group with the same `categoryId`.
- `AnomalyService.detectCategorySpike` still groups by `categoryId`, so a spike confined to a
  split-only category will not fire.
- No backfill of already-scanned receipts; no splits for bank/Wise imports or manual entry (neither
  has line items).
- Invented item NAMES on a reading whose arithmetic happens to reconcile are undetectable — one
  receipt stored two wholly fabricated line names whose prices summed to exactly the total.

## History

ABA-398 (the feature) · ABA-440 (discount and deposit in the tolerance gate) · ABA-441 (the rule
key moved to the printed line; table reset) · ABA-442 (re-read on a failed reconciliation) ·
ABA-449 (drop a discount the lines already reflect; aim the re-read by sign) · ABA-451 (never file
a line into the deposit category) · ABA-453 (Telegram handlers became real DI providers — they were
hand-constructed, so a new constructor dependency silently arrived as `undefined`) · ABA-459
(the re-read tracked as its own AI-COGS line, `ocr_reread`) · ABA-529 (category budgets attribute
splits — see [category-id-resolution](category-id-resolution.md) and the budget attribution util) ·
ABA-601 (standard names for proposals; the overall category vetoed by the split).
