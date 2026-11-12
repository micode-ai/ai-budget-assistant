# Child Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents name their children once, attribute whole expenses or single receipt lines to them, see per-child costs (with 800+ coverage and a share card) on phone and desktop web, and Pro editors generate a statement PDF for a child and period.

**Architecture:** A new account-scoped `Child` entity with an `expense_children` join and two nullable columns (`expense_items.child_id`, `incomes.child_benefit_child_id`), carried by the existing offline-first sync. One pure attribution core, duplicated as a canonical API util plus a `shared-utils` mirror (the `category-attribution.ts` pattern), computes per-child amounts for the device screen and the server PDF alike. A new API module `children` owns CRUD, attribution REST for web, server-side product→child rules, and the statement PDF on the reports PDF pipeline.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, Expo 54 / React Native (+ web), expo-sqlite + Drizzle, Zustand, pdfkit (existing reports generator), Jest.

**Spec:** `docs/superpowers/specs/2026-11-11-child-costs-design.md` (including "Decisions after the builder check" — binding).

## Global Constraints

- No model/LLM call anywhere in this feature (attribution, suggestion, 800+ detection are deterministic).
- Child stores only `name` (max 40), `color`, `archivedAt`, ids, timestamps — no birth date, surname, photo, school.
- `Child.name` is a tier-1 encrypted field: add `child: { tier1: ['name'], tier2: [] }` to `ENCRYPTION_FIELDS` (`packages/shared-utils/src/constants/index.ts`).
- Child names never go to a model, logs, telemetry, community layers; included in the account backup export; removed with the account.
- Whole-expense attribution (`ExpenseChild`) and line attribution (`ExpenseItem.childId`) are mutually exclusive per expense; the last action wins after a confirmation; bulk "Assign to child" skips expenses with line attribution and reports the skipped count.
- Several children on one expense split it equally unless a share is edited; `share` values on one expense sum to 1.
- Line attribution: an expense's per-child amount is the sum of its attributed lines with receipt discounts folded proportionally (same folding as receipt category splits).
- Totals use the same spend predicate as the Analytics tab: mobile `filterConsumption` (`apps/mobile/src/utils/consumption.ts`), API `EXCLUDE_SPLIT_RECEIVABLE` (`apps/api/src/common/utils/expense-filters.ts`) — filter on `isSplitReceivable` only, never `isDebt`; planned expenses (`isPlanned`) excluded on both sides.
- Currency: totals in the user's display currency per `docs/wiki/features/display-currency-conversion.md`; an amount with an unknown rate is excluded and flagged, never summed unconverted.
- 800+ detection is a device-side suggestion on income descriptions matching (case-insensitive, diacritics-insensitive) `800+`, `800 plus`, `rodzina 800`, `świadczenie wychowawcze`; one benefit payment per child per month counts; coverage = benefit received ÷ child spending in the same period.
- Learned product→child rules (`ProductChildRule`) are server-only, keyed by `normalizeProductName` from `apps/api/src/modules/merchant-rules/product-rules.service.ts`, written when a user attributes a line, offered as a suggestion, never applied silently.
- Receipt regeneration ("Extract items") carries `childId` onto a new line whose normalized product name equals an old attributed line's; the rest are cleared and the user is told how many could not be carried over.
- Statement PDF: `@RequireTier('pro')`, `ViewerBlockGuard`, only `encryptionTier === 0` (else 403 `{ code: 'ENCRYPTED_ACCOUNT' }`); the app flushes its sync queue first and refuses to request while anything for the account is pending; the PDF states "data as of <timestamp>"; footer on every page, localised: "Zestawienie sporządzone w aplikacji AI Budżet na podstawie danych wprowadzonych przez użytkownika"; no court headers, no "certified".
- Share card: thin wrapper over `ShareImageCard`; child name hidden by default (toggle); no merchant names.
- Copy never says a child "costs too much" and never compares children.
- Children are archived, never hard-deleted from the UI; archived children keep attributions and can still produce statements.
- Repo rules: schema change + migration in the same commit; no runtime import from `@budget/shared-*` in `apps/api` (`import type` only); fire-and-forget via `logFireAndForget`; every i18n key in all 9 locales; every new screen has a header and ships phone + desktop web (≥1024) together; platform split is component-level (`.web.tsx`), never route-level; nothing under `src/` imports from `app/`; viewers' write affordances wrapped in `canEdit`; any id from the client is resolved `OR:[{id},{clientId}]` and the resolved server PK is what gets written.

## Review Focus

1. **Expense with mixed currencies across children's history** (EUR holiday + PLN groceries): totals convert per display-currency rules and an unknown-rate line is excluded and flagged — pinned in Task 2 (`childCostSummary` test with an unknown rate) and Task 8 (PDF footnote test).
2. **Attributing a line on an expense that is already whole-expense attributed, offline**: the confirmation fires, the `expense_children` rows are soft-deleted and the item `childId` set, and both changes sync in order — pinned in Task 2 (`resolveAttributionMode`) and Task 5 (store test on queued changes).
3. **Receipt regeneration on an attributed receipt**: matched lines keep their child, unmatched lost count reported — pinned in Task 2 (`carryChildAttribution`) and Task 6 (ReceiptSection uses it).
4. **Archived child**: hidden from pickers but its screen, totals and statement still work — pinned in Task 3 (API filter tests) and Task 7 (screen list test).
5. **Statement requested with pending sync or on an encrypted account**: the app refuses before calling; the server refuses tier ≥ 1 with `ENCRYPTED_ACCOUNT` — pinned in Task 8.

---

## File Structure

Shared:
- `packages/shared-types/src/entities/child.ts` (+ `entities/index.ts` re-export): `Child`, `ExpenseChildLink`, `ChildCostSummary`, `ChildBenefitCoverage`.
- `packages/shared-types/src/dto/sync.ts`: `SyncChildPayload`, `SyncExpenseChildPayload`, `childId?` on `SyncExpenseItemPayload`, `childBenefitChildId?` on `SyncIncomePayload`, union members `'child'`, `'expense_child'`.
- `packages/shared-types/src/dto/child.ts` (+ barrel): REST DTOs.
- `packages/shared-utils/src/constants/index.ts`: `ENCRYPTION_FIELDS.child`.
- `packages/shared-utils/src/formatting/child-attribution.ts` — mirror of the API canonical util.

API:
- `apps/api/src/common/utils/child-attribution.ts` (+ spec) — canonical pure core.
- `apps/api/src/modules/children/` — `children.module.ts`, `children.controller.ts`, `children.service.ts`, `child-product-rules.service.ts`, `child-statement.service.ts`, `child-statement.pdf.ts`, `dto/index.ts`.
- `apps/api/src/modules/sync/handlers/child.handler.ts`, `expense-child.handler.ts`; modify `expense-item.handler.ts`, `income.handler.ts`, `sync.service.ts`.
- `apps/api/src/modules/backups/backups.service.ts` — export/restore children and links.

Mobile:
- `src/db/schema/index.ts`, `src/db/childRepository.ts`, modify `expenseItemRepository.ts`, `incomeRepository.ts`.
- `src/stores/childStore.ts`, `src/services/children.api.ts` (spread into `api`).
- `src/features/children/` — `useChildCosts.ts`, `childBenefit.ts` (re-export of the mirror detector), `useChildAttribution.ts`.
- `src/components/children/` — `ChildChips.tsx`, `ChildLinePicker.tsx`, `ChildCostsView.tsx`, `ChildCostsView.web.tsx`, `ChildCostsPhone.tsx`, `desktop/ChildCostsDesktop.tsx`, `ChildShareCard.tsx`, `ChildrenSettings.tsx`.
- Routes: `app/children/index.tsx` (list), `app/children/[id].tsx` (costs), `app/settings/children.tsx`.
- i18n namespace `children` in all 9 locales.

---

### Task 1: Data model, shared types, sync DTOs, encryption field

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create: `apps/api/prisma/migrations/20261113000000_children/migration.sql`
- Create: `packages/shared-types/src/entities/child.ts`, `packages/shared-types/src/dto/child.ts`
- Modify: `packages/shared-types/src/entities/index.ts`, `packages/shared-types/src/dto/index.ts`, `packages/shared-types/src/dto/sync.ts`, `packages/shared-utils/src/constants/index.ts`

**Interfaces:**
- Produces (Prisma, `@map` snake_case, matching `Tag`'s style):
  - `Child { id uuid, accountId, clientId String?, name String, color String?, archivedAt DateTime?, isDeleted Boolean @default(false), syncVersion Int @default(0), encryptedPayload String?, encryptionKeyVersion Int?, createdAt, updatedAt }` → `children`; `@@unique([accountId, name])`, `@@unique([accountId, clientId])`, `@@index([accountId])`.
  - `ExpenseChild { id uuid, expenseId, childId, share Decimal(5,4) @default(1), isDeleted Boolean @default(false), syncVersion Int @default(0), createdAt, updatedAt }` → `expense_children`; `@@unique([expenseId, childId])`; both FKs cascade.
  - `ExpenseItem.childId String? @map("child_id")` → FK `onDelete: SetNull`, `@@index([childId])`.
  - `Income.childBenefitChildId String? @map("child_benefit_child_id")` → FK `onDelete: SetNull`.
  - `ProductChildRule { id, accountId, productKey String, childId, updatedAt }` → `product_child_rules`; `@@unique([accountId, productKey])`; FKs cascade.
- Produces (types): `Child { id, accountId, clientId?, name, color?, archivedAt?: string | null }`; `ExpenseChildLink { expenseId, childId, share }`; `ChildCostSummary` and `ChildBenefitCoverage` (shapes in Task 2); sync payloads `SyncChildPayload { name, color?, clientId?, archivedAt?: string | null }`, `SyncExpenseChildPayload { expenseId, childId, share }`; DTOs `CreateChildRequest { name, color?, clientId? }`, `UpdateChildRequest { name?, color?, archived?: boolean }`, `SetExpenseChildrenRequest { childIds: string[]; shares?: number[] }`, `ChildSuggestionsResponse { [productKey: string]: string /* childId */ }`, `ChildStatementRequest { childId, from: string /* YYYY-MM-DD */, to: string, locale: string, currencyCode: string }`.
- Produces: `ENCRYPTION_FIELDS.child = { tier1: ['name'], tier2: [] }`.

- [ ] **Step 1:** Edit schema.prisma as above (relations on `Account`, `Expense`, `ExpenseItem`, `Income` next to their existing relations).
- [ ] **Step 2:** Generate the migration. Without a reachable DB: `git show HEAD:apps/api/prisma/schema.prisma > <scratch>/old.prisma` then `cd apps/api && npx prisma migrate diff --from-schema-datamodel <scratch>/old.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261113000000_children/migration.sql`. Expected: only CREATE TABLE/ADD COLUMN/INDEX/FK; no DROP (never `categories_account_system_key_type_live_key`).
- [ ] **Step 3:** `npx prisma generate` then `npm run typecheck`. Expected: PASS.
- [ ] **Step 4:** Add the shared types, sync union members and the encryption field; `npm run typecheck`. Expected: PASS. If an exhaustive switch over the sync union fails to compile, add `case 'child': case 'expense_child':` branches that throw `BadRequestException('not supported yet')`; Task 3 replaces them with the real handlers. Say so in the report.
- [ ] **Step 5: Commit** — `feat(children): data model, sync DTOs and encryption field`

### Task 2: Pure attribution core (canonical API util + shared-utils mirror)

**Files:**
- Create: `apps/api/src/common/utils/child-attribution.ts`, `child-attribution.spec.ts`
- Create: `packages/shared-utils/src/formatting/child-attribution.ts` (+ export from `formatting/index.ts`), `packages/shared-utils/src/formatting/child-attribution.spec.ts`

**Interfaces:**
- Produces (identical in both files; the shared-utils spec tests the mirror, the API spec tests the canonical copy):
  - `type AttributionMode = 'none' | 'whole' | 'lines'`
  - `interface AttribExpense { id: string; amount: number; currencyCode: string; date: string /* YYYY-MM-DD */; categoryId: string | null; discountAmount?: number | null; isSplitReceivable?: boolean | null; isPlanned?: boolean | null }`
  - `interface AttribItem { expenseId: string; totalPrice: number; lineDiscount?: number | null; childId: string | null; categoryId: string | null; canonicalName?: string | null }`
  - `resolveAttributionMode(links: ExpenseChildLink[], items: AttribItem[]): AttributionMode` — `'lines'` when any item has a `childId` (lines win over leftover links), `'whole'` when only links exist, else `'none'`.
  - `childAmounts(expense: AttribExpense, links: ExpenseChildLink[], items: AttribItem[]): Array<{ childId: string; categoryId: string | null; amount: number }>` — whole: `amount × share` per link in the expense's category; lines: sum of attributed `totalPrice − lineDiscount`, then the receipt-level `discountAmount` folded proportionally over all lines (same folding as `buildCategorySplits`), in each line's own category (falling back to the expense's). Excludes `isSplitReceivable` and `isPlanned` expenses (returns `[]`). Rounds to 2 decimals with the remainder on the largest share.
  - `childCostSummary(input: { childId: string; expenses: AttribExpense[]; links: ExpenseChildLink[]; items: AttribItem[]; convert: (amount: number, currency: string) => number | null; now: Date }): ChildCostSummary` where `ChildCostSummary = { monthTotal: number; yearTotal: number; averagePerMonth: number /* over months from first attributed month to now, inclusive */; byCategory: Array<{ categoryId: string | null; amount: number }>; months: Array<{ month: string /* YYYY-MM */; amount: number }> /* last 12 */; fxApproximate: boolean }` — `convert` returning `null` excludes that amount and sets `fxApproximate`.
  - `benefitCoverage(input: { childId: string; incomes: Array<{ amount: number; currencyCode: string; date: string; childBenefitChildId: string | null; isSplitReceivable?: boolean | null }>; spending: number; from: string; to: string; convert: (amount: number, currency: string) => number | null }): ChildBenefitCoverage` where `ChildBenefitCoverage = { benefit: number; spending: number; percent: number | null /* null when spending is 0 */ }`; counts at most one benefit income per child per calendar month (the largest).
  - `isChildBenefitDescription(description: string | null | undefined): boolean` — the four patterns from Global Constraints.
  - `carryChildAttribution(oldItems: Array<{ canonicalName?: string | null; description: string; childId: string | null }>, newItems: Array<{ canonicalName?: string | null; description: string }>, normalize: (s: string) => string): { childIds: Array<string | null>; lost: number }` — key = `normalize(canonicalName ?? description)`; each old attributed line can be matched once.

- [ ] **Step 1: Write failing tests** (same cases in both specs):
  - `whole expense with two children splits equally`: 100 PLN, shares 0.5/0.5 → 50/50.
  - `lines: sums attributed lines and folds the receipt discount proportionally`: lines 40 (child A), 60 (none), discount 10 → A = 36.
  - `lines win over links`: an item with childId plus a link → mode `'lines'`, amounts from lines only.
  - `split receivable and planned expenses contribute nothing`.
  - `summary excludes an unknown-rate amount and flags fxApproximate`: convert returns null for EUR → yearTotal counts only PLN, `fxApproximate: true`.
  - `averagePerMonth divides by months since the first attributed month`: first in 2026-09, now 2026-11-11, total 300 → 100.
  - `benefitCoverage counts one payment per month`: two 800 incomes in Nov for the child → benefit 800; spending 2000 → percent 40.
  - `benefitCoverage percent is null when spending is 0`.
  - `isChildBenefitDescription` matches `"ZUS 800+ wypłata"`, `"Rodzina 800 plus"`, `"swiadczenie wychowawcze"`, not `"Faktura 800"`.
  - `carryChildAttribution keeps matched lines and counts lost`: old [Pampers→A, Mleko→null, Chusteczki→A], new [Pampers, Chleb] → childIds [A, null], lost 1.
- [ ] **Step 2:** `cd apps/api && npx jest src/common/utils/child-attribution` and `cd packages/shared-utils && npx jest child-attribution` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement both copies (copy the canonical into the mirror; header comment in both naming the other, as `category-attribution.ts` does).
- [ ] **Step 4:** Run both — Expected: PASS. Run `bash scripts/check-no-shared-utils-runtime-import.sh` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(children): pure attribution core (API + shared-utils mirror)`

### Task 3: API — children module, attribution REST, sync handlers, product rules, backups

**Files:**
- Create: `apps/api/src/modules/children/{children.module.ts,children.controller.ts,children.service.ts,child-product-rules.service.ts,dto/index.ts}` + specs
- Create: `apps/api/src/modules/sync/handlers/child.handler.ts`, `expense-child.handler.ts` + specs; Modify: `handlers/index.ts`, `expense-item.handler.ts`, `income.handler.ts`, `sync.service.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/modules/backups/backups.service.ts`, `apps/api/src/modules/expenses/expenses.service.ts` (`findAll` select includes `items.childId` and `expenseChildren`), `apps/api/src/modules/incomes/incomes.service.ts` (accepts/returns `childBenefitChildId`)

**Interfaces:**
- Routes (`JwtAuthGuard + AccountContextGuard`; writes `@UseGuards(new ViewerBlockGuard())`):
  - `GET /children?includeArchived=true|false` → `Child[]` (default excludes archived).
  - `POST /children` `CreateChildRequest` → `Child` — upsert on `(accountId, name)`, adopts `clientId` only if the row has none (the `tags.service.create` rule).
  - `PATCH /children/:id` `UpdateChildRequest` → `Child` (`archived: true` sets `archivedAt`, `false` clears it). `:id` resolves `OR:[{id},{clientId}]`.
  - `PUT /expenses/:id/children` `SetExpenseChildrenRequest` → `ExpenseChildLink[]` — resolves expense by `OR:[{id},{clientId}]`; replaces links (soft-delete missing, upsert present); default shares `1/n`; clears every `ExpenseItem.childId` of that expense (whole wins). The two `/expenses/...` routes live on a second controller in the children module, `ExpenseChildrenController` (`@Controller('expenses')`), so `ExpensesController` is untouched; check no existing `expenses/:id/...` route shadows them.
  - `PATCH /expenses/:expenseId/items/:itemId/child` `{ childId: string | null }` → 204 — sets the item's child, soft-deletes all `ExpenseChild` links of the expense (lines win), and when `childId` is set upserts the `ProductChildRule` for `normalizeProductName(item.canonicalName ?? item.description)` fire-and-forget via `logFireAndForget`.
  - `POST /children/suggestions` `{ names: string[] }` → `ChildSuggestionsResponse` keyed by the normalized name, only non-archived children.
- Sync: `child` handler mirrors `tag.handler.ts` (idempotent create, clientId adoption, soft delete); `expense_child` handler mirrors the `expense_tag` case in `sync.service.ts` (resolve both PKs, soft delete on delete op); `expense-item.handler.ts` and `income.handler.ts` resolve and persist `childId` / `childBenefitChildId` (resolving `OR:[{id},{clientId}]`, writing the server PK, `null` clears, `undefined` leaves).
- Backups: export `children` and `expenseChildren`; restore remaps ids (never reuses source ids) inside the existing `$transaction`; `expenseItems.childId` and `incomes.childBenefitChildId` remapped.
- `ChildrenModule` exports `ChildrenService` (Task 8 consumes it).

- [ ] **Step 1: Write failing tests:**
  - `create is idempotent on name and adopts clientId once`.
  - `GET excludes archived unless includeArchived`.
  - `PUT expense children replaces links, default equal shares, and clears item childIds`.
  - `PATCH item child soft-deletes the expense's links and learns a product rule`.
  - `PATCH item child with another account's expense → 404`.
  - `suggestions return only non-archived children, keyed by normalized name`.
  - `viewer cannot write` (guard metadata test like other controllers).
  - sync: `child create twice with same clientId → one row`; `expense_child resolves clientIds to server PKs`; `expense_item childId null clears, absent leaves`; `income childBenefitChildId persists`.
  - backups: `export includes children and links; restore remaps ids`.
- [ ] **Step 2:** `npx jest src/modules/children src/modules/sync src/modules/backups` — Expected: FAIL.
- [ ] **Step 3:** Implement; register `ChildrenModule` in `app.module.ts`.
- [ ] **Step 4:** Tests PASS; `npm run typecheck`; eslint on changed files; `bash scripts/check-no-shared-utils-runtime-import.sh`.
- [ ] **Step 5: Commit** — `feat(children): API module, attribution routes, sync handlers, backups`

### Task 4: Mobile data layer — SQLite, repositories, store, API client

**Files:**
- Modify: `apps/mobile/src/db/schema/index.ts` (tables `children`, `expense_children`; columns `expense_items.child_id`, `incomes.child_benefit_child_id`, following the existing migration mechanism in that file)
- Create: `apps/mobile/src/db/childRepository.ts`; Modify: `expenseItemRepository.ts`, `incomeRepository.ts`
- Create: `apps/mobile/src/stores/childStore.ts`, `apps/mobile/src/services/children.api.ts`; Modify: `src/services/api.ts`, the sync push path that enqueues `expense_tag` (enqueue `child`, `expense_child` the same way, with `maybeEncrypt` for `child.name`)
- Test: `apps/mobile/src/stores/__tests__/childStore.test.ts`, `apps/mobile/src/db/__tests__/childRepository.test.ts`

**Interfaces:**
- `childStore`: `children: Child[]`, `loadChildren(accountId)`, `createChild(name, color?)`, `renameChild(id, name)`, `setArchived(id, archived)`, `syncFromServer()`, `setExpenseChildren(expenseId, childIds: string[], shares?: number[])`, `setItemChild(expenseId, itemId, childId: string | null)`, `reset()` — offline-first: SQLite first, then queue; local `id` stays the `clientId`; web (no SQLite) goes straight to REST (Task 3 routes). `setExpenseChildren` clears local item childIds of that expense; `setItemChild` soft-deletes local links of that expense (mutual exclusivity mirrored on the device).
- Repos: `getChildren(accountId, includeArchived)`, `upsertChild`, `getExpenseChildLinks(accountId)`, `replaceExpenseChildLinks(expenseId, links)`, `setExpenseItemChild(itemId, childId)`, `getAttributedItems(accountId)`, `setIncomeChildBenefit(incomeId, childId | null)`.
- `children.api.ts`: one method per Task 3 route.
- The store is cleared in the sign-out/account-switch `reset()` path like other account-scoped stores.

- [ ] **Step 1: Write failing tests:** `createChild writes SQLite then enqueues a 'child' change with clientId = local id`; `setItemChild on an expense with links soft-deletes the links locally and enqueues both changes in order (links first)`; `setExpenseChildren clears item childIds and enqueues`; `reset clears children`.
- [ ] **Step 2:** `cd apps/mobile && npx jest src/stores/__tests__/childStore src/db/__tests__/childRepository` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; `npm run typecheck`; mobile lint.
- [ ] **Step 5: Commit** — `feat(children): mobile data layer and store`

### Task 5: Settings → Children and whole-expense attribution (phone + desktop)

**Files:**
- Create: `apps/mobile/app/settings/children.tsx` (thin `SettingsRoute`), `src/components/children/ChildrenSettings.tsx`, `src/components/children/ChildChips.tsx`
- Modify: `src/features/settings/settingsRegistry.ts` (entry under the reference-data group), the expense create form (`src/components/expenses/create/ExpenseCreateForm.tsx`) and the expense detail edit form + desktop `ExpenseDialog` (a "For" chip row), the transactions multi-select bulk actions (phone and `ExpensesDesktopDialogs.tsx`) with "Assign to child", `app/_layout.tsx` header registration if the settings route needs it, 9 locales (`children.*`)
- Test: `src/features/children/__tests__/bulkAssign.test.ts`

**Interfaces:**
- Consumes: `childStore` (Task 4), `resolveAttributionMode` (Task 2 mirror).
- Produces: `ChildChips` props `{ children: Child[]; selected: string[]; onChange(ids: string[]): void; disabled?: boolean }`; pure `planBulkAssign(expenseIds: string[], modeOf: (id: string) => AttributionMode): { assign: string[]; skipped: number }` in `src/features/children/bulkAssign.ts`.
- Settings screen follows the reference-data screen layout (`docs/wiki/features/reference-data-screens.md`): list, add, rename, archive/unarchive, colour; archived section collapsed. Viewers read-only.
- Selecting chips on an expense that has line attribution shows the confirmation "Replace the per-line attribution with the whole expense?" before calling `setExpenseChildren`.
- Bulk "Assign to child" reports "Assigned N, skipped M with per-line attribution".

- [ ] **Step 1: Write failing test:** `planBulkAssign skips 'lines' expenses and counts them`.
- [ ] **Step 2:** `npx jest src/features/children` — FAIL.
- [ ] **Step 3:** Implement screen, chips, form wiring, bulk action, keys in all 9 locales (i18n-add-strings procedure).
- [ ] **Step 4:** Tests PASS; typecheck; lint. Best effort: check the settings screen and an expense form at 390 px and 1280 px on the web build.
- [ ] **Step 5: Commit** — `feat(children): manage children and attribute whole expenses`

### Task 6: Receipt line attribution, suggestions, regeneration carry-over, 800+ marking

**Files:**
- Create: `src/components/children/ChildLinePicker.tsx`, `src/features/children/useChildAttribution.ts`
- Modify: the receipt confirm card (`src/components/receipt/ReceiptExpenseView.tsx` and its line rows), `ExpenseItemsSection` on expense detail and the desktop `ExpenseDialog`, `src/components/expenses/detail/ReceiptSection.tsx` and the desktop dialog's "Extract items" path (use `carryChildAttribution`), the income detail card + desktop income dialog (800+ mark with suggestion), 9 locales
- Test: `src/features/children/__tests__/useChildAttribution.test.ts`

**Interfaces:**
- Consumes: `POST /children/suggestions`, `childStore.setItemChild`, `carryChildAttribution`, `isChildBenefitDescription` (shared-utils mirror), `normalizeProductName` equivalent on the device (import the shared-utils normalizer if one exists; else add `normalizeProductKey` to the Task 2 mirror and canonical file with a spec proving it equals `normalizeProductName` on the cases in `product-rules.service.spec.ts`).
- `useChildAttribution(expenseId)` → `{ mode, suggestions: Record<itemId, childId>, setLine(itemId, childId | null), setWhole(childIds) }` — `setLine` on a `'whole'` expense asks the confirmation first; suggestions fetched once per receipt when online, absent offline; a suggestion is shown highlighted, never applied.
- Regeneration: after replacing items, apply `childIds` from `carryChildAttribution` via `setItemChild`, and if `lost > 0` show "N child attributions could not be carried over".
- Income: a "800+ for <child>" selector on income detail; when `isChildBenefitDescription(description)` and the income has no mark, a one-line suggestion chip ("Looks like 800+ — mark for…").

- [ ] **Step 1: Write failing tests:** `setLine on a whole-attributed expense requires confirmation`; `suggestions are not applied automatically`; `regeneration applies carried childIds and reports lost` (pure part via `carryChildAttribution` already tested; here test the hook's apply sequence with mocked store).
- [ ] **Step 2:** `npx jest src/features/children` — FAIL.
- [ ] **Step 3:** Implement across phone and desktop surfaces; keys in 9 locales.
- [ ] **Step 4:** Tests PASS; typecheck; lint.
- [ ] **Step 5: Commit** — `feat(children): receipt line attribution, suggestions and 800+ marking`

### Task 7: Child costs screen, Analytics entry, share card (phone + desktop)

**Files:**
- Create: `app/children/index.tsx`, `app/children/[id].tsx` (thin routes; headers registered in `app/_layout.tsx`), `src/features/children/useChildCosts.ts`, `src/components/children/{ChildCostsView.tsx,ChildCostsView.web.tsx,ChildCostsPhone.tsx,desktop/ChildCostsDesktop.tsx,ChildShareCard.tsx,ChildrenList.tsx}`
- Modify: the Analytics tab (phone and desktop `BreakdownGrid`) — a "Children" section listing each non-archived child with its month total, linking to `/children/[id]`; hidden when the account has no children; 9 locales
- Test: `src/features/children/__tests__/useChildCosts.test.ts`

**Interfaces:**
- Consumes: `childCostSummary`, `benefitCoverage` (mirror), `filterConsumption`, the display-currency converter used by `useFilteredTransactions`, `childStore`, the expense/income stores and `getAttributedItems`/`getExpenseChildLinks` repos (web: REST data the stores already hold plus `GET /children`).
- `useChildCosts(childId)` → `{ summary: ChildCostSummary | null; coverage: ChildBenefitCoverage | null; loading: boolean }` — called in the `ChildCostsView` parent above the 1024 split and passed down (never inside a platform child).
- Screen shows month, year, average per month, category breakdown (split-aware labels), 12-month bars, the 800+ coverage line when benefit income exists, `fxApproximate` notice, actions **Share card** and **Statement PDF** (Task 8 wires the PDF). Archived children appear in `/children` under an "Archived" section and their screen works.
- `ChildShareCard` wraps `ShareImageCard`: year, total, average per month, coverage percent; name only when the toggle is on (default off); handles `share()` resolving `false` (web/timeout).

- [ ] **Step 1: Write failing tests:** `useChildCosts excludes split receivables via filterConsumption`; `returns coverage null when no benefit income`; `archived child still yields a summary`.
- [ ] **Step 2:** `npx jest src/features/children` — FAIL.
- [ ] **Step 3:** Implement (desktop layout: dense table + rail per the desktop design language; get a short spec from aba-web-designer if the controller provides one).
- [ ] **Step 4:** Tests PASS; typecheck; lint; best-effort web check at 390/1280 px.
- [ ] **Step 5: Commit** — `feat(children): child costs screen, analytics entry and share card`

### Task 8: Statement PDF (Pro) — API generator and app action

**Files:**
- Create: `apps/api/src/modules/children/child-statement.service.ts`, `child-statement.pdf.ts` + specs; Modify: `children.controller.ts`, `children.module.ts` (imports `SubscriptionsModule`, `ReportsModule` exports if needed)
- Modify mobile: `src/services/children.api.ts` (`downloadChildStatement`), `ChildCostsPhone.tsx`, `desktop/ChildCostsDesktop.tsx`, 9 locales
- Test: `child-statement.service.spec.ts`, `child-statement.pdf.spec.ts`, `apps/mobile/src/features/children/__tests__/statementGate.test.ts`

**Interfaces:**
- `POST /children/:id/statement` `ChildStatementRequest` → `application/pdf` via `@Res()` (send once, like the backups export) — guards `JwtAuthGuard, AccountContextGuard, SubscriptionTierGuard` + `@RequireTier('pro')` + `new ViewerBlockGuard()`. Refuses `403 { code: 'ENCRYPTED_ACCOUNT' }` when `account.encryptionTier !== 0`; `400` on `from > to` or a range over 24 months *(builder's call kept: 24)*; child resolved within the account, archived allowed.
- `ChildStatementService.build(accountId, childId, from, to, currencyCode, locale): Promise<StatementData>` — loads expenses with `EXCLUDE_SPLIT_RECEIVABLE`, `isPlanned: false`, `isDeleted: false`, their items, links, `receiptImage` presence; computes with the canonical `childAmounts` + `childCostSummary`; FX through `common/utils/fx.ts`.
- `renderChildStatementPdf(data: StatementData, t: (key) => string): Promise<Buffer>` on the same pdfkit setup as `reports/generators/pdf-generator.ts`, using `planTransactionRows` from `pdf-row-layout.util.ts` for row heights: cover (child name, period, generated timestamp "data as of", account name), totals by category and by month, line table (date, merchant, description, category, original amount + currency, converted amount, "whole"/"line"), unknown-rate lines listed with a footnote and excluded from totals, then an appendix with each attributed expense's `receiptImage` downscaled to ≤ 800 px wide, one per page; localized footer on every page with the exact sentence from Global Constraints (pl text verbatim; other locales translated).
- App gate `canRequestStatement(state: { tier: string; encryptionTier: number; pendingChanges: number; canEdit: boolean }): 'ok' | 'pro' | 'encrypted' | 'pending' | 'viewer'` in `src/features/children/statementGate.ts`; before calling, flush the sync queue, re-count pending; `'pro'` opens `useUpgradeStore.getState().show(...)`; download/save via the existing report export path (no `expo-file-system` call from a store).

- [ ] **Step 1: Write failing tests:** API — `free tier → 403 TIER_REQUIRED` (guard metadata), `tier-1 account → ENCRYPTED_ACCOUNT`, `excludes split receivables and planned`, `unknown-rate line listed, excluded from total, footnote present`, `archived child allowed`, `another account's child → 404`, `every page carries the footer sentence` (render to buffer, parse text with `pdf-parse` as other PDF specs do); mobile — `statementGate` returns each code.
- [ ] **Step 2:** `npx jest src/modules/children` (api) and `npx jest src/features/children` (mobile) — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; api typecheck + eslint on changed files; mobile typecheck + lint.
- [ ] **Step 5: Commit** — `feat(children): Pro statement PDF`

### Task 9: Docs and wiring

**Files:**
- Create: `docs/wiki/features/child-costs.md` (What this is, Entry points, Key concepts, Invariants = the Global Constraints that bite, Known gaps: 50/50 co-parent ledger, bots/chat attribution, no What's New entry yet), linked from `docs/wiki/analytics-insights.md` and `docs/wiki/index.md`; pointers from `features/tags.md`, `features/receipt-category-split.md`, `features/account-backups.md`; one line in `docs/wiki/log.md` (`## Ingests`, issue placeholder `ABA-TBD`)
- Modify: `user_docs/<9 langs>/` — extend the analytics section file (find it with `ls user_docs/en`) with "Child costs" (managing children, attributing, 800+, share card, Pro statement, the advice to keep children on a personal account for separated parents); `npm run generate:help`; public help rebuild per `features/help-content-pipeline.md` with `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`, force-adding only changed help pages (docs/marketing is gitignored)
- Modify: `CLAUDE.md` API modules list only (add `children` alphabetically; no count, no feature description)

- [ ] **Step 1:** Write the pages; `python scripts/wiki-lint.py` — Expected: no findings.
- [ ] **Step 2:** `npm run generate:help` — Expected: `apps/mobile/src/help/content.ts` regenerated.
- [ ] **Step 3: Commit** — `docs(children): wiki page, user docs, module list`
