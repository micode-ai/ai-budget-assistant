# Categorize uncategorized expenses — design

Date: 2026-09-24 · Status: approved in brainstorming, awaiting spec review

## Problem

A user who starts scanning receipts ends up with most expenses uncategorized, and some
miscategorized. Evidence from the owner's own shared account **House** (prod, 2026-09-24):
26 expenses, **19 without a category**, only five categories (Zaliczka, Tax, Kancelaria,
Engineer. Acceptance., Present). It is a house-purchase-and-renovation account — OBI, Castorama,
Leroy Merlin, a notary, taxes, tickets to Brest/Kaliningrad/Warsaw — not an everyday one.

Three causes, all in the code today:

1. **The receipt prompt forces a pick from the list.** `ocr.service.ts` asks for
   `"suggestedCategory": "best matching category from the available list"`, so when nothing fits the
   model picks the nearest wrong thing — two Leroy Merlin receipts on House landed in *Zaliczka*
   (advance payment). When the suggestion does not match a name exactly
   (`receipt-finalizer.service.ts:58`), the expense saves uncategorized.
2. **Only the first account is seeded.** `accounts.service.ts:638` seeds the 17 default categories
   into the user's initial *Personal* account only; any later account starts (nearly) empty.
3. **Nothing categorizes after the fact.** Bank-notification captures and manual entries without a
   category stay that way; the only bulk tool is picking a category by hand.

## Goal and success criterion

One button turns a pile of uncategorized expenses into categorized ones, while creating only a
**handful** of new categories — on House, 19 expenses should resolve into roughly three new
groups (building materials / notary-and-official fees / travel) plus existing ones, not nineteen
names. The user reviews everything before anything is written.

## Decisions (from brainstorming)

- **Anti-sprawl policy (A).** The model sees the whole batch at once, plus the account name and its
  existing categories. Preference order: existing category → a default category, only if it
  genuinely fits → a new shared category, only if it covers **≥ 2 expenses**. At most **5** new
  categories per pass. Anything not confidently placed is left unassigned for the user. Names in
  the account owner's language (same convention as the receipt split's proposals).
- **Scan time (A).** The receipt prompt may answer `null` ("nothing fits") instead of forcing a pick.
  No new categories are proposed at scan time — they appear only through the review, where the
  user sees the whole picture.
- **Entry point (A).** A banner above the expense list when the current account has uncategorized
  expenses — mobile Expenses tab and the desktop transactions screen — plus the same action inside
  the existing "without category" filter. Hidden for viewers and when the count is 0.
- **Cost.** Outside the monthly AI quota; own per-account daily ceiling of 5 passes.

## Approach

One batched, clustering LLM call per pass (chosen), rather than calling the existing per-expense
`GET /ai/suggest-category` for each row and de-duplicating on the client — classifying each expense
in isolation is exactly how "Materiały budowlane", "Budowlanka" and "Remont" all appear. Embedding
clustering was rejected as overkill for batches of 19–100.

## 1. Server

### `POST /ai/categorize-uncategorized`

Guards: `JwtAuthGuard` + `AccountContextGuard` (class-level on `AiController`) +
`new ViewerBlockGuard()`. **Read-only — writes nothing.**

Input: none required (optional `limit`, capped at 100). Candidates: the most recent ≤ 100 expenses
of `req.accountId` with `categoryId: null`, `isDeleted: false`, not planned, not a split receivable,
not a debt (`isPlanned`/`isSplitReceivable`/`isDebt` all false), and **not E2EE**
(`encryptedPayload` null — the server cannot read their text)) — the E2EE count is returned so the
UI can say why they were skipped.

Response (new DTOs in `packages/shared-types/src/dto/`):

```ts
/** One uncategorized expense offered for review by POST /ai/categorize-uncategorized. */
export interface CategorizeCandidateExpense {
  /** Server PK. */
  id: string;
  /** The creating device's local id, when it had one — lets a client find its own row. */
  clientId: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  currencyCode: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * A suggested destination for some expenses. Exactly one of `categoryId` /
 * `proposedName` is set: an existing category, or a new one the user may create.
 */
export interface CategorizeSuggestionGroup {
  categoryId: string | null;
  proposedName: string | null;
  /** Server PKs, each present in `expenses`. */
  expenseIds: string[];
}

export interface CategorizeSuggestionsResponse {
  expenses: CategorizeCandidateExpense[];
  groups: CategorizeSuggestionGroup[];
  /** Server PKs nothing confident was found for. */
  unassigned: string[];
  /** E2EE expenses the server cannot read and therefore skipped. */
  skippedEncrypted: number;
  /** Model passes left today for this account after this one. */
  remainingToday: number;
  /** True when the daily ceiling stopped the model step; rule-based groups are still returned. */
  limitReached: boolean;
}
```

### Cheapest first

1. **Merchant rules** — `MerchantRulesService.getRulesMap(accountId)`, keyed by
   `merchant.trim().toLowerCase()`. Free; a pass resolved entirely by rules does not call the model
   and does not count against the ceiling.
2. **Model** — the remaining candidates in one call with the cheap model (`resolveCheapModel()`),
   `response_format: json_object`, every user string through `sanitizeForPrompt`.

### The model never sees or returns an id

Prompt input: account name, the owner's language, the account's expense category **names**, the
default category names for that language (`getDefaultCategories`), and each candidate as
`{index, merchant, description, amount, currency, itemNames[≤5]}`. Output:

```json
{ "assignments": [{ "index": 0, "categoryName": "Tax" }],
  "newCategories": [{ "name": "Materiały budowlane", "indexes": [1, 2, 5] }] }
```

A pure validator (`categorize-suggestions.util.ts`, unit-tested), same never-trust-only-drop posture
as `receipt-category-split.service.ts`:

- indexes outside `[0, n)` or already claimed are dropped; **an assignment to an existing category
  wins a contested index** (assignments validated first, seeding the `claimed` set);
- `categoryName` must match an existing name case-insensitively (a `Set`, not an object map);
  an unknown name is dropped;
- a proposed name that equals a default category name is kept as a proposal (it will be created);
  one that equals an existing category (case-insensitive) is folded into that category;
- a proposal must normalize to 2–30 chars with at least one letter, must cover **≥ 2** surviving
  indexes, and at most **5** survive (length check at the top of the loop);
- the deposit category (`isDepositCategoryName`) is excluded from the prompt and from valid names;
- every index left over goes to `unassigned`.

### Ceiling

`AI_CATEGORIZE_MAX_PER_DAY` (default 5, NaN-guarded via the same `resolveDailyLimit` helper the
receipt split uses), per-account Redis counter. Incremented only after the model call returns; a
thrown call does not burn a pass. At the ceiling the endpoint still returns rule-based groups with
`limitReached: true`.

### Scan-time prompt change

`ocr.service.ts`: `"suggestedCategory": "a category from the available list, or null if none of them
genuinely fits — never pick the closest wrong one"`. `receipt-finalizer.service.ts` already maps a
missing suggestion to `categoryId: null`. This one prompt is shared by the app and all three bots.

### Learning on bulk apply

`ExpenseBulkService.bulkUpdate`, when `categoryId` is set, upserts a merchant rule
(`MerchantRulesService.upsertRule`) for each updated expense that has a non-empty merchant —
fire-and-forget through `logFireAndForget`, mirroring what `ExpensesService.update()` already does
for a single edit. Next pass, the same merchant resolves by rule with no model call.

### Logging

One `[Categorize]` line per pass: `candidates=N rules=R ai=A proposed=P unassigned=U` or the reason
the AI step was skipped (`no_candidates`, `all_rules`, `limit_reached`, `ai_error`).

## 2. Client (mobile + desktop web)

**One implementation, two hosts.** Shared content component `CategorizeReview`, state in hook
`useCategorizeSuggestions` backed by a **pure reducer** (unit-tested). Hosts:

- **Mobile** — route `app/expense/categorize.tsx`, with a header (title + back), registered in
  `app/_layout.tsx`.
- **Desktop (≥ 1024)** — a wide dialog dispatched from `ExpensesDesktopDialogs.tsx`, hosting the same
  `CategorizeReview`.

### State model

Each candidate expense has a chosen target: `existing:<categoryId>` | `new:<draftKey>` | `skip`.
Groups are **derived** from those targets (so moving a row moves it between groups). A new-category
draft has an editable name. Initial state comes from the response: rule/AI groups selected,
`unassigned` rows set to `skip`.

### UI

- Groups ordered new-then-existing by total amount; header shows ✚ (will be created) or ● (exists),
  name, count and sum, and a checkbox (unchecked = leave these rows alone).
- Tapping a new group's name renames it; a group-level picker retargets the whole group (turn a
  proposal into an existing category in one tap).
- Each row (merchant · date · amount) has a ▾ picker: existing categories, this pass's proposals,
  "+ Create new".
- "Couldn't determine" section, unchecked, each row pickable by hand.
- Footer: Cancel · **Apply (N expenses · +K categories)**. Nothing is created before Apply.

### Apply — `applyCategorization` (shared, unit-tested with store mocks)

1. Create each used new-category draft via `categoryStore.createCategory` (clientId as today).
2. For each target category, `expenseStore.bulkUpdateExpenses(ids, { categoryId })` — optimistic,
   SQLite on native, queued on failure; the server resolves clientId-or-id.
3. Toast: "Categorized N expenses, created K categories". Return to the list.

Expense ids from the response are server PKs; the store matches rows by `id` or `serverId`
(the established client-id resolution rule — never assume the route/local id is the server PK).

### Entry points

- Banner component `UncategorizedBanner` above the mobile Expenses list and above the desktop
  transactions table: "N expenses without a category — Suggest categories". Count computed from the
  loaded expense list (both platforms hold it); hidden when 0 or `!canEdit()`.
- Same action in the existing "without category" filter (`ExpenseFilterBar` / `FacetRail`).
- Offline: banner button disabled with a hint (suggestions need the server); applying an
  already-loaded review works offline on native.

Planning deltas (2026-09-24): the response carries `expenses` so the review renders rows the client
has not loaded; `source` was dropped (nothing reads it); no second button inside the "without
category" filter (the banner sits directly above it); no offline detection — the app has no
network-status hook, so a failed request shows the error state with Retry.

### States

Loading skeleton ("Analyzing N expenses…"); `limitReached` → note "AI suggestions are used up for
today — rule-based ones are shown" (not a blocked button); empty response → "Nothing to suggest";
error → retry.

### i18n

New `categorize.*` namespace in all 9 locales (banner, title, group labels, apply summary with
plurals, states, toast).

## 3. Testing and verification

**API (Jest):** validator — invented index/name dropped, a 1-expense proposal dropped to
`unassigned`, 6th proposal dropped, proposal equal to an existing name folded, contested index goes
to the assignment, deposit category excluded; service — all-rules pass skips the model and the
counter, a thrown model call does not increment, the 6th pass returns rules only with
`limitReached`; OCR — `suggestedCategory: null` yields `categoryId: null`; bulk — a category bulk
update upserts merchant rules for rows with a merchant.

**Mobile (Jest):** reducer — retarget row moves it, rename draft, retarget group, uncheck group,
apply summary counts; `applyCategorization` — categories created before `bulkUpdateExpenses`,
nothing created on cancel, unused drafts not created. Component rendering is not testable in this
repo (no RN testing library) — verified live.

**Live on House (prod, after deploy):**
1. Snapshot House `expenses.id → category_id` first, for a one-statement rollback.
2. Web desktop via Chrome: banner shows 19 → review groups are sensible, ≤ 5 new categories → Apply.
3. DB check: new categories few; uncategorized 19 → ~3–5; merchant rules written.
4. Second pass on the remainder: rule hits, no model call.
5. Phone: after sync the same categories appear on House; the owner checks the screen on a device.

## Out of scope

Re-reviewing already-(mis)categorized expenses (the two Leroy/Zaliczka rows stay as they are);
incomes; a bot command; applying merchant rules at notification-capture or scan time; seeding
default categories into non-first accounts.
