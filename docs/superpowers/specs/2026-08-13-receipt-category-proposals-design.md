# Receipt Category Proposals — Design (v1)

The receipt category auto-split (ABA-398) can only ever split a receipt across
categories the account already owns. When it owns none that fit, it refuses, and
says nothing about why. This design lets the classifier propose the missing
category instead of going quiet — and lets the user, not the model, decide
whether that category comes into existence.

## The field evidence this comes from

The first production scan after ABA-398 shipped produced no split. The forensics,
in order:

- API on `dc7f9349`, migrations `20260812120000` / `20260812120001` applied. Not
  a deploy problem.
- A Biedronka receipt, 30 line items, 231.64 PLN. Items summed to 225.65 — a 2.6%
  gap, comfortably inside the 5% tolerance. Not an arithmetic problem.
- `product_category_rules` gained 31 rows at the moment of the scan, so the
  classifier ran and returned a valid answer for every line. Not a model failure.
- All 31 rows pointed at the same category. The account has exactly three expense
  categories — Bills & Utilities, Entertainment, Food & Dining — and there are no
  system categories in production. Whisky, tulips, shower gel and a bottle deposit
  all legitimately belong to the only one of the three that fits.
- `buildCategorySplits` therefore saw one group and returned `[]`
  (`apps/api/src/common/utils/receipt-category-split.ts:86`).

Nothing was broken. The premise was: an account already owns a taxonomy a
supermarket receipt maps onto. For an account that does not, ABA-398 is invisible
and — because rules are learned at scan time and rules are consulted before the
model — it stays invisible even after the user adds the missing categories, since
every product now resolves from a rule pointing at the single category that
existed on the first scan. That second-order effect had to be repaired by hand in
production.

Two defects follow from that, and this design fixes both.

## Locked decisions (from brainstorming)

1. **Propose, never create at scan time.** The model may nominate a missing
   category; the category row is written only when the user saves the receipt.
   This matches the convention already settled in this repo: `create_category` in
   AI chat is a **write action requiring explicit confirmation**. A scan the user
   abandons must leave the account exactly as it found it — which is precisely
   what the scan-time rule writes violated.
2. **Free-form names, not a fixed dictionary.** The model names the category
   itself, so a niche receipt (car parts, fishing tackle, a pharmacy run) is
   covered rather than only the handful of names a hand-written list would
   anticipate. The cost of this choice is validation: normalization and
   duplicate-defence move to the server, below.
3. **The account's language, always.** `user.language`, the same rule the default
   category seed follows (`modules/accounts/default-categories.ts`). Not the
   receipt's language — a holiday abroad would otherwise splinter the taxonomy
   into several languages.
4. **Bots create on confirmation.** Telegram / WhatsApp / Slack already hold a
   scanned receipt in `pendingReceipts` and write the expense only after the user
   presses confirm, so they have the same consent moment mobile does — the
   category is created there, not when the photo arrives. The alternative would
   be dropping the split whenever it contains a proposal, which would leave
   exactly the accounts this feature exists for without one. Partial application
   is not an option: dropping only the proposed groups breaks the exact-sum
   invariant.
5. **Rule learning moves entirely to save time.** See "Rule learning" below.

### Non-goals for v1

- A second model call. Proposals ride on the existing single classification call.
- A new endpoint, a new table, a migration. There are none.
- Backfill of receipts already scanned.
- Proposing category *deletions*, merges, or renames.
- Letting the model choose an icon or colour. Both are assigned server-side.
- Tier-2 (fully E2EE) accounts, still skipped before any classification.
- Budgets, safe-to-spend and `get_budget_status`, still reading the expense's own
  single `categoryId`. Unchanged from ABA-398.

## Contract with the model

The prompt in `ReceiptCategorySplitService.classifyWithModel` gains one optional
output key. The response shape becomes:

```json
{
  "assignments":    [{"line": 1,  "category": "Groceries"}],
  "newCategories":  [{"name": "Alkohol", "lines": [12, 19]}]
}
```

Added prompt rules, in the same register as the existing ones:

- Propose a new category only when several lines clearly belong together and no
  listed category fits them.
- Name it in `<account language>`, as a short noun phrase.
- Never propose a name that restates a listed category.
- At most `MAX_PROPOSED_CATEGORIES` (3).
- The existing "do not return any amounts, prices, totals or percentages"
  constraint stands unchanged and now covers proposals too.

The account language is resolved from the requesting user. `userId` already
reaches every scan path, so it is threaded into `finalizeReceipt` and a single
`user.findUnique({ select: { language: true } })` resolves it, defaulting to
`'en'`. The model is told the language name, never asked to guess it.

## Validation — the server trusts nothing

A sibling of `validateAssignments`, holding the same line: anything invented,
malformed or duplicated is dropped silently, never repaired and never trusted.

- Trim, collapse internal whitespace, strip control characters.
- Reject shorter than 2 or longer than 30 characters, and reject a name that is
  purely numeric or punctuation.
- Reject a name equal to an existing category under `trim().toLowerCase()` — the
  same comparison `validateAssignments` already uses, against the same `Set`
  (never an object map, so `constructor` and friends cannot pass).
- Reject a name equal to an earlier accepted proposal under the same comparison.
- Validate every line index against `[1, lines.length]`, as assignments are.
- **Assignments win over proposals.** A line named in both keeps its assignment;
  the proposal keeps only its unclaimed lines. A proposal left with no lines is
  dropped. This makes the resolution order deterministic rather than dependent on
  the order the model happened to emit.
- Keep at most 3 surviving proposals.

`classify()` returns proposals alongside assignments. It creates nothing: no
`category.create` call exists anywhere in the AI module, and none is added.

## Arithmetic and transport

`ReceiptCategorySplit.categoryId` becomes `string | null`, where `null` means
"proposed, does not exist yet". `categoryName` already carries the name, so no
second field is needed. Both copies of the type change together — canonical
`apps/api/src/common/utils/receipt-category-split.ts`, mirror
`packages/shared-utils/src/formatting/receipt-category-split.ts` — under the same
duplicated-pair convention as `financial-month.ts`.

The pure `buildCategorySplits` is **not** changed. It groups by whatever key it is
handed, and `null` already means "unassigned" to it, which is a different concept
and must stay that way. So `runCategorySplit` groups a proposal under the
synthetic key `proposed:<name>` and rewrites that key to `categoryId: null` on the
way out. The mobile mirror does the same in reverse when it recomputes after an
edit, keying a proposal locally as `new:<name>`. The synthetic key never leaves
the function that created it, and never reaches a DTO or the database.

The consequence that matters: a proposal is an ordinary group, so the exact-sum
invariant holds untouched, and one real category plus one proposal is already
enough to clear the `groups.size < 2` floor that produced the silence.

## Mobile

`app/expense/receipt.tsx` seeds `itemCategories` from the incoming splits, keying
a proposed group as `new:<name>`, and its existing recompute-on-every-edit path
carries on working unchanged.

- `CategorySplitChips` renders a proposed chip with a leading `+` and a distinct
  outline, so "will be created" is legible before saving, not after.
- `ItemCategorySheet` lists proposals as pickable options in their own section,
  marked as new. A user who disagrees moves the lines elsewhere; a proposal that
  loses its last line disappears and is never created. That is the reject path —
  no separate dismiss control.
- The all-or-nothing drop at `receipt.tsx:96-115` learns to tell `null`
  ("proposed") from "did not resolve", and stops treating the former as a reason
  to discard the whole set.
- On save, each surviving proposal goes through
  `categoryStore.createCategory(name, 'expense', icon, color)` — idempotent since
  ABA-392, offline-first, returns the existing row on a name clash — and the real
  ids are substituted into both `splits` and `items[].categoryId` before the
  expense is written. Nothing else in the save path changes.
- Icon `🏷️`; colour picked deterministically from the palette already used by
  `default-categories.ts`, keyed on the name, so two devices creating the same
  category agree. Both are editable afterwards in Settings like any category.

A viewer cannot reach this: saving an expense is already `ViewerBlockGuard`-ed, so
no category can be created by a role that may not write.

## Bots

All three `handlers/photo.handler.ts` already map `categorySplits` into
`dto.splits`, on the confirm branch that runs `expensesService.create` — not when
the photo arrives. They gain one shared server-side helper — proposals in, real
category ids out — that calls the idempotent `CategoriesService.create` per
proposal and substitutes the ids, invoked at that same confirm branch. One
helper, three call sites, mirroring how `buildCategorySplitLine` is shared today.

The receipt summary the bot posts *before* confirmation prints the proposed
category names like any other group. A user who does not want them declines the
receipt, and nothing is written — the same granularity bots already offer for
every other field of a scanned receipt.

Their reply line needs no new i18n key: it prints category names, and a created
category has one. Telegram's `escapeHtml()` wrapping already covers it, which
matters more here than before — a model-named category is free text.

## Rule learning

There are exactly two writers of `product_category_rules`:

- `receipt-category-split.service.ts:85`, at **scan** time, from the model's raw
  answer.
- `expenses.service.ts:517`, at **save** time, from `resolvedItemCategoryIds` —
  the ids the lines actually ended up with, resolved to real server ids.

The first is deleted. The second already does the right thing, including for
lines the user re-assigned by hand, and needs no change at all. What this buys:

- An abandoned scan teaches nothing, so it cannot poison an account it never
  wrote an expense to.
- Rules record what the user accepted, not what the model guessed.
- A proposed category has no id at scan time, so a scan-time writer could not
  have learned from it anyway without inventing one.

The "learn once, then it is free" property is preserved — it simply keys off
saved receipts now. Rules accumulate slightly more slowly and are worth more.

## Observability

`runCategorySplit` gets one log line stating the outcome and its reason:
`few_lines`, `no_categories`, `one_category`, `gap_over_tolerance`, or
`ok(<groups>, proposed=<n>)`. Its absence is why diagnosing the production silence
required reading `product_category_rules` in the database rather than the logs.

## Edge cases

- Model returns no `newCategories` — behaviour is exactly today's, including the
  refusal, now with a log line naming the reason.
- Every line falls under proposals and none under an existing category — still two
  or more groups, so it splits; all of them are created on save.
- One proposal only, and no existing category has any line — `groups.size < 2`,
  refused. Correct: a single category is not a split.
- The proposed name races an identically-named category created between scan and
  save — `createCategory` is idempotent, so the existing row wins.
- Offline save — `createCategory` writes SQLite first and syncs later, the same
  path a manually created category takes.
- Daily inference ceiling spent — rules-only, no model call, so no proposals.
  Unchanged.

## Testing

- `validateProposals` unit tests: duplicate of an existing name (case and
  whitespace variants), duplicate of another proposal, over-length, 1-character,
  numeric-only, out-of-range line index, more than three proposals, a line claimed
  by both an assignment and a proposal.
- `ReceiptCategorySplitService` tests: proposals returned alongside assignments;
  `classify` writes no rule and creates no category.
- `runCategorySplit` tests: a proposal becomes a `categoryId: null` group; the
  synthetic key never appears in the output; one real plus one proposed group
  clears the floor that previously refused; sums stay exact to the cent.
- Mobile: recompute keeps a proposal after an unrelated line is re-assigned; a
  proposal stripped of its last line vanishes; the incoming-split resolver keeps a
  set containing `null` instead of dropping it.
- Bots: the resolve helper substitutes ids and the created expense's splits sum to
  the expense amount.
- A regression test pinning the ABA-398 production case: three categories, a
  grocery receipt, everything into one category, no proposals — still refuses,
  and logs `one_category`.

## Follow-ups (explicitly out of v1)

- Re-deriving splits for historical receipts once an account's taxonomy fills out.
- A "your categories look too coarse" nudge outside the scan flow.
- Proposing merges for near-duplicate categories the user accumulates.
- Backfilling the accounts already stuck on a single-category taxonomy.
