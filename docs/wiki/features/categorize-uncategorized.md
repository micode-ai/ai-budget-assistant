# Categorize uncategorized expenses (and incomes)

*Hub: [ai-features](../ai-features.md) · [api](../api.md) · [mobile-app](../mobile-app.md)*

## What this is

One button that turns a pile of uncategorized expenses into categorized ones. A pass batches an
account's uncategorized expenses into one review: existing categories where they genuinely fit, a
handful of new shared categories where nothing does, and an honest "couldn't determine" pile for
the rest. Nothing is written until the user reviews the whole picture and taps Apply. Written
because receipt scanning tends to leave most expenses uncategorized (the scan prompt used to force
a pick from the list and land things in the nearest wrong category instead), and because only the
first account a user creates gets seeded with default categories — every later account starts
empty.

## Entry points

- `apps/api/src/modules/ai/services/categorize-suggestions.service.ts` —
  `CategorizeSuggestionsService.suggest()`, the whole pass
- `apps/api/src/modules/ai/utils/categorize-suggestions.util.ts` — `validateCategorization`, the
  pure validator
- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/categorize-uncategorized`
- `apps/api/src/modules/ai/services/ocr.service.ts` — the scan-time prompt change (may answer
  `null`)
- `apps/api/src/modules/expenses/expense-bulk.service.ts` — `bulkUpdate`'s merchant-rule learning
- `apps/mobile/src/features/categorize/` — `categorizeReview.ts` (reducer), `applyCategorization.ts`,
  `useCategorizeSuggestions.ts`
- `apps/mobile/src/components/categorize/` — `CategorizeReview.tsx` (shared content),
  `CategoryTargetPicker.tsx`, `UncategorizedBanner.tsx`
- `apps/mobile/app/expense/categorize.tsx` — the native route
- `apps/mobile/src/components/expenses/desktop/CategorizeDialog.tsx` — the desktop host, dispatched
  from `ExpensesDesktopDialogs.tsx`
- `packages/shared-types/src/dto/ai.ts` — `CategorizeCandidateExpense`, `CategorizeSuggestionGroup`,
  `CategorizeSuggestionsResponse`

Design: `docs/superpowers/specs/2026-09-24-categorize-uncategorized-design.md`. Income extension
(ABA-595) design: `docs/contracts/categorize-uncategorized-incomes.md`.

**Income entry points**, mirroring every expense one above:
- `apps/api/src/modules/ai/services/categorize-income-suggestions.service.ts` —
  `CategorizeIncomeSuggestionsService.suggest()`
- `apps/api/src/modules/ai/ai.controller.ts` — `POST /ai/categorize-uncategorized-income`
- `apps/api/src/modules/incomes/income-bulk.service.ts` — `IncomeBulkService.bulkUpdate` (new
  `PATCH /incomes/bulk`, no merchant-rule learning — income has no merchant field)
- `apps/mobile/app/income/categorize.tsx` — the native route
- `apps/mobile/src/components/expenses/ExpensesMobile.tsx` / `.../desktop/ExpensesDesktop.tsx` —
  the income-tab / second desktop `UncategorizedBanner`

## Key concepts

**Cheapest first.** `suggest()` answers from learned merchant rules
(`MerchantRulesService.getRulesMap`, see [merchant-category-rules](merchant-category-rules.md))
before it ever calls the model — a pass resolved entirely by rules costs nothing and does not touch
the daily ceiling. Only the merchant-less remainder goes to one batched model call.

**One call, the whole batch, so the model can cluster.** Classifying each expense in isolation is
exactly how near-duplicate categories are born (three separate but synonymous names for the same
pile of hardware-store receipts). The prompt gets the account name, the owner's language, the
account's own category names, and each remaining candidate as
`{index, merchant, description, amount, currency, itemNames[≤5]}`, sanitized through
`sanitizeForPrompt`. It answers with `assignments: [{index, categoryName}]` and
`newCategories: [{name, indexes}]` — indexes and names only, never an amount, a total, or an id.

**Candidates.** The most recent ≤ 100 expenses of the account with `categoryId: null`,
`isDeleted: false`, and none of `isPlanned` / `isSplitReceivable` / `isDebt` — a planned expense
isn't spend yet, a split receivable isn't the payer's own spend, and a debt already has its own
model. E2EE expenses (`encryptedPayload` set) are excluded outright — the server cannot read their
text — and counted separately as `skippedEncrypted` so the UI can say why they were skipped rather
than silently under-counting.

**The validator never repairs, only drops.** Same posture as
[receipt-category-split](receipt-category-split.md)'s `validateProposals`: an index outside
`[0, n)`, an already-claimed index, an unrecognized `categoryName`, or a proposal too small to be a
real group is dropped, never coerced into something valid. Everything dropped lands in
`unassigned` for the user to place by hand. Category names are matched against a `Set`, not a plain
object, so a category literally named `constructor` can't collide with `Object.prototype`.

**Resolution order for a proposed name.** A proposal whose (case-insensitive) name matches an
*existing* category folds into that category as if it had been an assignment — the model naming an
existing category back at itself is treated as an assignment, not a duplicate creation. This is the
*validator's* rule, and it knows nothing about `getDefaultCategories`. Default names are steered at
the *prompt* stage instead: `askModel` sends the owner-language `getDefaultCategories()` list — minus
names that already match an existing category (case-insensitive) and minus the deposit name via
`isDepositCategoryName` — as a `Standard category names` line, with the rules text spelling out the
preference order existing → standard name → invented name. A default name the model uses is a plain
string like any invented one by the time it reaches the validator: it is created on Apply exactly the
same way, since this account was never seeded with it. `default-categories.ts` has no field marking a
name as income-only (`Salary`/`Freelance` sit in the same per-language array as `Groceries`), so both
kinds are currently offered — a known imprecision, not fixed in this pass.

**Groups are derived, not stored.** The mobile/desktop review holds one map from expense id to a
chosen `Target` (`existing:<categoryId>` | `new:<draftKey>` | `skip`); `deriveGroups` recomputes the
group list from it every render. Moving one row to a different target is a single map write, not a
list-surgery operation — there is no second data structure that could drift out of sync with it.

**Two hosts, one component.** `CategorizeReview` renders the same content whether it's mounted at
`app/expense/categorize.tsx` (native, plus web narrower than the desktop breakpoint) or inside
`CategorizeDialog.tsx` (desktop ≥ 1024, a fixed-height panel `CategorizeReview` grows to fill,
exactly like `CreateDialog` hosts `ExpenseCreateForm`). Neither host mutates
`useCategorizeSuggestions`'s state directly — both just render it and call `onDone`.

**Apply order matters.** `applyCategorization` creates every used new-category draft first (an
unused draft — renamed to empty, or its group unchecked — is never created), then calls
`expenseStore.bulkUpdateExpenses(ids, { categoryId })` once per resolved target. A proposal that
folded into an existing category during validation was already `kind: 'existing'` by the time it
reached the reducer, so it costs no create call.

**Id resolution follows the established rule.** The response's `expenses[]` carry SERVER primary
keys. `resolveLocalExpenseId` matches a row by `serverId`, then `id`, then (if present) the
creating device's `clientId`, and falls back to the server id itself when the client holds no local
copy at all — the case for a row the web review renders straight from the response without ever
having loaded it into a store. This mirrors the project-wide id-resolution rule in
[client-id-resolution](client-id-resolution.md): a route param or a bare incoming id is never
trusted as the key to write with.

## Invariants

- **The endpoint writes nothing.** `POST /ai/categorize-uncategorized` only ever reads; every
  category is created, and every expense updated, by the client after the user hits Apply, through
  the same `categoryStore.createCategory` / `expenseStore.bulkUpdateExpenses` any other mobile flow
  uses.
- **The model speaks indexes and category names only** — never a candidate id, never an amount.
  Anything else it invents is dropped by the validator, not coerced.
- **A new category needs at least 2 expenses and at most 5 survive per pass.** A one-expense
  "category" is exactly the sprawl this feature exists to prevent; the 6th (and later) valid
  proposal in a pass is dropped outright, regardless of how many expenses it would cover.
- **An assignment to an existing category always wins a contested index.** `validateCategorization`
  processes `assignments` before `newCategories` and seeds the `claimed` set from them, so a model
  answer that both assigns and proposes the same index resolves toward the existing category.
- **The deposit category is excluded from the prompt and from valid names.** Filtered by
  `isDepositCategoryName` before the category list ever reaches the model or the validator's name
  set — the same rule [receipt-category-split](receipt-category-split.md) enforces for its own
  classifier, and for the same reason: a returnable-packaging line must never be filed there by an
  unrelated pass.
- **The daily counter increments only after a successful model call.** `AI_CATEGORIZE_MAX_PER_DAY`
  (default 5, NaN-guarded) is a per-account Redis counter under `aicat:{accountId}:{date}`,
  incremented once the model responds — a thrown call leaves it untouched, so a transient OpenAI
  failure doesn't burn a day's pass. At the ceiling the endpoint still returns rule-based groups
  (`limitReached: true`); it never turns into a hard error.
- **Bulk recategorization teaches merchant rules.** `ExpenseBulkService.bulkUpdate`, when the patch
  sets `categoryId`, upserts a rule for every distinct non-empty merchant among the updated rows —
  the same signal `ExpensesService.update()` already teaches from a single manual edit. A second
  categorize pass (or an import) resolves those merchants for free, with no model call.
- **The receipt scan prompt may return `null` rather than forcing a pick.** `ocr.service.ts`'s
  `suggestedCategory` field is now explicitly "or null if none of them genuinely fits… never pick
  the closest wrong one"; `receipt-finalizer.service.ts` already mapped a missing suggestion to
  `categoryId: null`, so this needed no downstream change.
- **Same input, same answer, one pass.** The validated model answer is cached for 30 minutes
  under `aicatres:{accountId}:{sha1(unresolved candidate ids + category id:name)}`, and the call runs
  at `temperature: 0`. Reopening the review — or the web screen mounting twice, which happened on the
  first live run and spent two of the day's five passes on two different answers — must neither
  spend another pass nor reshuffle the groups. Any change to the candidates or the category list
  misses the cache. On the client, `shareInFlight` makes concurrent mounts share one request —
  keyed by account id, so a request started for one account is never shown on a screen that has
  since switched to another.
- **A store variant joins its store's group without the model.** After the model (and also when it
  was skipped or failed), `matchByMerchant` adds an unassigned expense to the one group holding an
  expense whose merchant words equal its own, or whose name of at least two words it extends (a
  chain name with the city appended). A one-word name is never extended — "Uber" → "Uber Eats" is a
  different service, not a branch. The first word needs at least three letters, and a merchant
  matching more than one group is left for the user.
- **A category created from the review gets a real icon and colour.** `categoryStyle(name, t)`
  matches the proposed name against the default expense categories by English name OR localized
  display name and returns their Ionicons icon + colour; anything else gets `folder-outline` and the
  same neutral grey `createCategory` already defaults to. The "couldn't determine" group starts
  collapsed — its rows are the heterogeneous leftovers and should not compete with the main action.
- **The suggestions carry SERVER ids.** The client resolves them via `serverId → id → clientId`,
  falling back to the server id itself when none of the three match a locally-held row.
- **The native route owns the bottom safe-area inset; `CategorizeReview` itself stays inset-free.**
  `app/expense/categorize.tsx` wraps it in `SafeAreaView edges={['bottom']}` (matching
  `expense/merge.tsx`) so the footer clears the Android nav bar / iPhone home indicator.
  `CategorizeDialog.tsx` on desktop hosts the same component with no such wrapper — adding an inset
  inside `CategorizeReview` would double it on native and misplace it inside the desktop panel.

## Incomes (ABA-595)

Same review, same component tree, a second entity type. The split: the CLIENT layer
(`CategorizeReview`, `UncategorizedBanner`, `useCategorizeSuggestions`, `categoryStyle`,
`CategorizeDialog`/`ExpensesDesktopDialogs`) takes an `entityType: 'expense' | 'income'` prop/arg
and is genuinely shared — `categorizeReview.ts` (the reducer), `applyCategorization.ts`,
`shareInFlight.ts` and `CategoryTargetPicker.tsx` needed ZERO changes, because they already spoke
only in opaque ids and injected deps. The SERVER layer is a fork, not a parametrization:
`CategorizeIncomeSuggestionsService` is its own file, not a generic branch inside
`CategorizeSuggestionsService` — `Income` and `Expense` are different Prisma delegates with
different candidate shapes (no `merchant`, no `items`, a `source` enum instead), and forcing one
generic service to branch on entity type throughout would cost as much complexity as two small,
readable services. Both DO share `validateCategorization`/`MAX_NEW_CATEGORIES`/
`MIN_EXPENSES_PER_NEW_CATEGORY` from `categorize-suggestions.util.ts` unchanged — that file already
spoke only in candidate indexes and category names, so nothing about it was expense-specific.

Deliberate simplifications versus the expense pass, not oversights:
- **No merchant-rule pre-pass, no deterministic top-up.** Income has no merchant field, so
  `CategorizeIncomeSuggestionsService.suggest()` goes straight from candidates to the one batched
  model call — no `MerchantRulesService` lookup, no `matchByMerchant` step.
- **No "standard category names" prompt line.** The expense prompt nudges the model toward
  `getDefaultCategories()`'s per-language names; the income prompt does not, since that list mixes
  expense-only names into the same array (a pre-existing imprecision, see above) and splitting it
  was out of scope here. The income model only ever sees the account's own existing income
  categories — it invents any new name outright.
- **Shares the expense pass's daily counter.** `AI_CATEGORIZE_MAX_PER_DAY` /
  `aicat:{accountId}:{date}` is an account-level throttle, not an expense-specific one — the income
  service reads and increments the SAME Redis key. There is no separate income quota knob. The
  result-answer cache is namespaced separately though (`aicatinc:` vs. the expense service's
  `aicatres:`), purely so the two can never collide even though their hashed inputs never overlap
  in practice.
- **`PATCH /incomes/bulk` is v1-scoped to `categoryId` only** — no `tagIds`/`isDeleted`, unlike its
  `PATCH /expenses/bulk` sibling. Declared before `@Patch(':id')` in `incomes.controller.ts` for the
  same Express route-ordering reason `expenses.controller.ts` already documents (ABA-166) — getting
  this wrong silently 400s the whole bulk op.
- **`CategoryTargetPicker.tsx`'s draft-name preview icon is expense-only.** It calls
  `categoryStyle(name, t)` with the default `entityType` (`'expense'`) when live-previewing a
  not-yet-created category's icon while the user types a name in the picker — an income draft named
  exactly "Salary" won't borrow that default's icon there (falls through to the neutral folder).
  `CategorizeReview.tsx` itself calls `categoryStyle(name, t, entityType)` correctly everywhere it
  matters (the group card icon actually shown), so this is a cosmetic gap in one preview surface,
  not a functional one.

## Known gaps

Out of scope for this pass, matching the design's stated boundaries: re-reviewing expenses/incomes
that are already (mis)categorized; applying merchant rules at notification-capture or
receipt-scan time; seeding default categories into non-first accounts; a bot command for either
entity type (chat has no room for the review UI — the expense side shipped a simplified, sequential
bot variant instead: [bot-categorize-command](bot-categorize-command.md); incomes have no bot
equivalent at all).

Also not done:

- **No offline detection.** The app has no network-status hook, so a failed request just shows the
  error state with Retry rather than a proactive "you're offline" banner.
- **A mid-loop apply failure is not rolled back.** If `bulkUpdateExpenses` fails partway through the
  plan's assignments, the categories already created and the groups already applied stay applied.
  Retrying re-runs `applyCategorization` from the same reviewed plan, which is idempotent for
  category creation (existing categories resolve by id) and for the bulk update (setting the same
  `categoryId` again is a no-op), so a retry is safe — but nothing surfaces "this partially
  succeeded" to the user beyond the toast reflecting the final counts.
- **Two clients opening the review at the same moment still spend two passes.** The result cache
  only helps once the first answer is stored, and `shareInFlight` only dedupes inside one JS
  instance; a web tab and the phone opened together both miss the cache (with `temperature: 0`
  they at least get the same answer).
- **`categoryStore.createCategory` swallows a server error and returns a local-only category.** If
  the create-category call in `applyCategorization`'s first phase fails on the server (but not
  locally), the caller never sees it — it gets back a category that exists on-device only, and the
  bulk-assignment calls that follow reference an id the server doesn't have. `bulkUpdateExpenses`'s
  new `awaitServer` option (ABA-589 F2) only makes the *assignment* half of Apply honest about a
  server failure; category creation's honesty is a separate, still-open gap.

## History

ABA-589 — the feature: the batched categorize pass, the scan-time `null` prompt change, and
merchant-rule learning on bulk recategorization.
[ABA-590](https://github.com/micode-ai/ai-budget-assistant/issues/614) — the first live run spent two
passes per open with two different answers and left a store variant ungrouped: result cache,
`temperature: 0`, merchant top-up, shared in-flight request. New category names follow the owner's
language by design; whether the reviewing member's language should win is open.
ABA-595 — extended the pass to incomes: `POST /ai/categorize-uncategorized-income`,
`PATCH /incomes/bulk`, and an `entityType` prop threaded through the whole client component tree
(see **Incomes** above for the fork/parametrize split).
