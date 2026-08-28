# Returnable-Packaging Deposits as Their Own Category — Design

Almost every European country charges a refundable deposit on bottles and cans —
`kaucja` in Poland, `Pfand` in Germany, `statiegeld` in the Netherlands,
`consigne` in France. It is printed in its own block on the receipt, it is
included in the amount due, and today it is invisible: the app folds it into
whichever category happened to be largest and never names it.

This design surfaces it. The deposit becomes its own category in the receipt's
split, so a user can see how much of the month went into packaging they are
entitled to get back.

## What already exists

The groundwork landed on 2026-08-28 as part of the split-gate work (ABA-440):

- The OCR prompt extracts the deposit block (`OPAKOWANIA ZWROTNE` / kaucja /
  Pfand / statiegeld / consigne / depósito, plus Cyrillic labels) into
  `ParsedReceipt.deposit`.
- `validateAndNormalizeReceipt` discards an implausible value (at or above the
  receipt total).
- It reaches `ReceiptExpense.depositAmount` and is passed to
  `buildCategorySplits({ deposit })`, where it **widens the tolerance gate** —
  the lines legitimately fall short by the deposit, because a deposit is never a
  line item.

What is missing is everything after that: the value is not persisted, not shown,
and inside the arithmetic it dissolves into the residual and lands on the largest
group.

## Locked decisions

From brainstorming, both chosen by the human partner:

1. **The deposit is still spending, shown as its own category.** Totals do not
   change. It is not excluded from spend the way `isSplitReceivable` debts are,
   and there is no "reclaimable balance" counter.
2. **A deposit always forms its own split group.** It counts toward the
   "at least two distinct categories" rule, so a receipt that is otherwise
   entirely groceries splits into groceries + deposit. Making the deposit
   visible whenever it exists is the whole point of the feature.

### Non-goals

- Detecting bottle **returns**. A return appears on a receipt, if at all, as an
  unlabelled negative line or a coupon, and the data to distinguish it from an
  ordinary discount is not there. Without returns there is also no balance to
  carry, which is why decision 1 rules out a reclaimable counter.
- Bank import and manual entry. Neither carries deposit information.
- Any change to spend totals, budgets, or safe-to-spend.

## Data

One column, mirroring `discountAmount` exactly — the same shape, the same path,
the same display treatment:

```prisma
depositAmount Decimal? @map("deposit_amount") @db.Decimal(12, 2)
```

- `packages/shared-types/src/entities/expense.ts` — `depositAmount?: number`
  beside `discountAmount`.
- `CreateExpenseDto` / `UpdateExpenseDto` — optional, validated as a
  non-negative number.
- `ExpensesService.create` writes it from the dto, exactly as it writes
  `discountAmount`.
- Mobile SQLite: `deposit_amount` column + `expenseRepository` mapping.

**Why persist it at all when the split already carries the amount.** The split
is emitted only when the receipt's arithmetic reconciles, and over four scans of
one real receipt it refused twice. A deposit the app read but could not split
must still be visible on the expense, and a stored figure is also the only way
to measure how reliably the deposit is being extracted — which nothing currently
can, because the value has never been written down.

## Where the category comes from

**Not a new default category.** `AccountsService` seeds categories per account,
localized, at account creation (`getDefaultCategories(language)`). Adding an
entry there reaches new accounts only, leaving every existing user without the
category the feature depends on, and a backfill across all accounts in nine
languages is a migration nobody should want.

**Reuse the proposal mechanism instead.** The split already knows how to emit a
group whose category does not exist yet: `ReceiptCategorySplitPayload.categoryId`
is `null`, the name travels alongside, and the save path creates it through the
idempotent `CategoriesService.create` — in the mobile receipt screen and, via
`resolveProposedSplits`, in all three bots. The deposit group is emitted the same
way, with its name in the account owner's language (the `LANGUAGE_NAMES` table
`ReceiptCategorySplitService` already uses for proposals).

**The name is ours, not the model's.** Unlike a model proposal, this category
has a fixed meaning, so its name comes from a small API-local table keyed by the
owner's language — the same nine locales, beside the existing `LANGUAGE_NAMES`
map and never through i18next, which the API does not use. It is a plain word
per language (`Kaucja`, `Pfand`, `Statiegeld`, `Consigne`, `Залог за тару`, …),
not a phrase, because it will sit in a category list next to "Groceries". A
receipt is scanned in the account owner's language regardless of who scanned it,
which keeps the category stable for shared accounts.

This gives, for free:

- existing accounts get the category on their next deposit receipt, no backfill;
- nothing is created by a scan the user abandons;
- a second deposit receipt reuses the category rather than minting a duplicate.

The internal `proposed:<name>` key stays server-side and the mobile `new:<name>`
key stays client-side, exactly as they do now; the deposit introduces no third
sentinel.

## The materiality exemption — the trap in this feature

`receipt-finalizer.service.ts` drops any proposed category accounting for less
than `MIN_PROPOSAL_SHARE_PCT` (10%) of the receipt. A deposit is typically 1–2%:
4.50 on a 233.98 basket is 1.9%.

**Built naively, this feature logs `dropped 1 immaterial proposal(s)` and never
appears.** The deposit group must be exempt from that filter.

The exemption is principled, not a convenience. The threshold exists to stop the
model *inventing* a lasting category to hold three zloty. The deposit is not
invented: it is a printed, labelled block of the receipt with a name the app
supplies itself. The filter should apply to model-proposed categories and not to
this one, so the exemption belongs at the point where proposals are filtered, as
an explicit "this proposal is not a guess" flag rather than a special-cased name
comparison.

## Arithmetic

`buildCategorySplits` (the deliberately duplicated pair —
`apps/api/src/common/utils/receipt-category-split.ts` canonical,
`packages/shared-utils/src/formatting/receipt-category-split.ts` mirror) changes
in one way: when a deposit is present it becomes an explicit group of exactly
`depositCents`, and is therefore no longer part of the residual.

Unchanged:

- the gate, still `|Σitems − discount + deposit − total| ≤ tolerance`;
- the discount still spread proportionally across the non-deposit groups;
- the residual — unassigned lines, rounding — still going to the largest group,
  which must be the largest *non-deposit* group: a deposit is a known, exact
  figure and must not absorb someone else's rounding;
- **the invariant**: group cent-values sum to the total exactly.

The deposit group counts toward the two-category minimum (decision 2). One
consequence worth stating plainly: a receipt whose lines are all groceries now
produces two groups where it previously produced none.

## Clients

Nothing new to transport: the group rides on `ReceiptExpense.categorySplits`,
which is always present, so all four scan paths and all three bots receive it
without new wiring.

- **Receipt screen** — the deposit appears as an ordinary chip. Below the total,
  an "of which deposit" line mirroring the existing discount line
  (`app/expense/receipt.tsx`).
- **Expense detail** — the same line beside the discount line
  (`app/expense/[id].tsx`), shown whether or not a split was emitted.
- **Bots** — the existing `buildCategorySplitLine` reply already lists groups by
  name; the deposit appears in it with no change.
- i18n: the category name and the "of which deposit" label, nine locales each.

## Analytics

Nothing to build. Once the deposit is a category with a split row,
`groupExpensesByCategory` counts it like any other, including the three-month
trailing average behind `vsAverage`, so a deposit month is not compared against
deposit-free history.

## Edge cases

- **Deposit but no line items** (a receipt where OCR found nothing to itemize):
  no split — one group is not a split — but `depositAmount` is still stored and
  displayed.
- **Deposit larger than the receipt**: already discarded during normalization.
- **Tier-2 encrypted accounts**: classification is skipped before line items are
  touched; unchanged here.
- **User reassigns lines on the receipt screen**: the deposit group is not line
  derived, so it must survive a recompute rather than being rebuilt from
  `items[].categoryId`.
- **The user deletes the deposit category**: rules and splits cascade as they do
  for any category; the next receipt proposes it again.

## Testing

- `buildCategorySplits`, both copies: a deposit forms its own group of exactly
  the deposit amount; the groups still sum to the total exactly; a deposit plus
  one category of lines yields two groups; the residual lands on the largest
  non-deposit group.
- The materiality exemption: a 1.9% deposit survives the filter while a 1.9%
  model proposal does not.
- `ExpensesService.create` persists `depositAmount`.
- Existing OCR, finalizer and split suites must stay green unchanged.

## What we do not know

**How reliably the deposit is extracted.** It has never been persisted, so there
is no measurement — over four scans of one receipt we know only that the *split
gate* behaved. Once the column exists this becomes answerable, and it should be
answered before the feature is considered done: if the deposit is read on half
of eligible receipts, the fix is the OCR prompt, not the split.

The receipt used throughout this design (Biedronka, 233.98 PLN, `OPAKOWANIA
ZWROTNE SUMA 4,50` from four bottles and five cans) is a good first measurement.

## Follow-ups

- A deposit total on the analytics screen ("47 zł in packaging this year"),
  once there is evidence the figure is trustworthy.
- Bottle returns, and with them a genuine reclaimable balance.
- Adding the category to `getDefaultCategories` for new accounts, so their first
  deposit receipt does not need a proposal at all.
