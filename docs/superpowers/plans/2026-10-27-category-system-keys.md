# Category System Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify standard categories by a language-independent `systemKey` instead of their name, show them in the UI language unless the user renamed them, and do it without breaking any existing client or data.

**Architecture:** One keyed catalog (duplicated pair: API `common/utils` + `shared-utils` mirror) replaces the API's per-locale default lists and the app's English seed list. Two additive `Category` columns (`system_key`, `name_customized`) are backfilled by the migration itself. The server alone assigns keys; every identity lookup (deposit, duplicate check, default ids, classifier) matches by key with a name fallback for keyless rows; the app computes the displayed name from the key.

**Tech Stack:** NestJS 10 + Prisma 5 (jest specs beside sources), Postgres partial unique index, Expo 54 / React Native with SQLite (jest-expo), `packages/shared-utils`, `packages/shared-types`.

**Spec:** `docs/superpowers/specs/2026-10-27-category-system-keys-design.md`

## Global Constraints

- `systemKey` is server-owned: clients never send it, the API ignores it in create/update/sync payloads, and an absent field never clears a key.
- The server never rewrites `name` on a language switch; `name` stays filled for every row so an old app shows what it shows today.
- Display name = `name` when there is no key or `nameCustomized` is true; otherwise the catalog name for the current UI language; `name` if the key is unknown to this app version.
- Any rename of a keyed category sets `nameCustomized = true` on the server, whichever client sent it.
- Creating a catalog name (explicit or automatic) returns the account's live category with that key and type if one exists; otherwise the new row gets the key.
- Matching is type-scoped (`expense`/`income`); no name maps to two keys of one type.
- At most one live category per `(account_id, system_key, type)` — enforced by a partial unique index `WHERE system_key IS NOT NULL AND NOT is_deleted`; races are handled by catching P2002 and re-reading the winner.
- Backfill: only live rows of non-E2EE accounts; a name equal (trim, case-insensitive) to a catalog name of the same type in any of the nine locales gets that key; several candidates → the one with the most expenses, then the oldest; `name_customized` stays false; nothing is merged, deleted or re-pointed.
- E2EE accounts (`encryptionTier >= 1`) get no keys and keep today's name-based behaviour.
- The catalog is a duplicated pair (canonical `apps/api/src/common/utils/category-catalog.ts`, mirror `packages/shared-utils/src/formatting/category-catalog.ts`) with a parity test; the API never imports a runtime value from `@budget/shared-utils`.
- Keys are camelCase English slugs and permanent once shipped. Expense keys: `foodAndDining`, `groceries`, `alcohol`, `household`, `transport`, `shopping`, `entertainment`, `billsAndUtilities`, `health`, `education`, `clothing`, `gifts`, `travel`, `subscriptions`, `other`, `coffeeAndDrinks`, `personalCare`, `deposit`. Income keys: `salary`, `freelance`, `investments`, `gifts`, `otherIncome`.
- Catalog names: entries from the API's `default-categories.ts` keep those per-locale names; app-only entries (`coffeeAndDrinks`, `personalCare`, income `investments`, `gifts`, `otherIncome`) take the app's existing `categories.expense.<key>`/`categories.income.<key>` translations; the app's "Health & Fitness" seed is key `health` (one concept, one key); `deposit` names equal `DEPOSIT_CATEGORY_NAMES`.
- A `schema.prisma` change lands with its migration in the same commit (CLAUDE.md, ABA-558).
- Every UI change ships phone and desktop web; all nine locales (`en de es fr pl ru ua be nl`).
- One commit per task locally; squashed into one `ABA-{N}` commit before any push; nothing pushed without the user's OK.

## Review Focus

1. **An old app renames "Groceries" to "Food"** — on a new app the category reads "Food" in every language, never flips back to the catalog name. Test: `CategoriesService.update` "rename of a keyed row sets nameCustomized even without any new field" (Task 3).
2. **An old app pushes a category upsert through `/sync` without `systemKey`** — the stored key survives. Test: sync handler "category upsert without systemKey keeps the stored key" (Task 3).
3. **Two concurrent automatic creates of "Groceries"** — one row, both callers get its id. Test: "P2002 on the key index re-reads the winner" (Task 3).
4. **A user whose UI is English but whose categories were created in Polish** — after the update the keyed ones read in English, custom ones unchanged, no budget figure moves. Test: `getCategoryDisplayName` cases (Task 5) and the backfill dry run (Task 2 Step 6).
5. **An offline-seeded `default-exp-groceries` row meets the server's keyed Polish groceries row on first pull** — they converge into one row (no duplicate in pickers). Test: `categoryStoreLegacyConvergence` "converges a seed with the server row of the same key" (Task 5).

---

### Task 1: Keyed category catalog (API + shared-utils mirror)

**Files:**
- Create: `apps/api/src/common/utils/category-catalog.ts` + `category-catalog.spec.ts`
- Create: `packages/shared-utils/src/formatting/category-catalog.ts` (identical body; header names its twin); export from `formatting/index.ts`
- Modify: `apps/api/src/modules/accounts/default-categories.ts` — `getDefaultCategories(language)` derives from the catalog (seeded entries only, same order and output shape as today); `defaultCategorySlot` is removed and its callers switch to `catalogKeyForName`
- Create: `apps/mobile/src/features/categories/__tests__/categoryCatalogParity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CatalogLocale = 'en' | 'de' | 'es' | 'fr' | 'pl' | 'ru' | 'ua' | 'be' | 'nl';
  export interface CatalogEntry { key: string; type: 'expense' | 'income'; icon: string; color: string; seeded: boolean; names: Record<CatalogLocale, string> }
  export const CATEGORY_CATALOG: readonly CatalogEntry[];
  export function catalogKeyForName(name: string, type: 'expense' | 'income'): string | null;
  export function catalogName(key: string, type: 'expense' | 'income', locale: string): string | null; // unknown locale → en
  export function catalogEntry(key: string, type: 'expense' | 'income'): CatalogEntry | null;
  ```
  `seeded: true` exactly for the entries `getDefaultCategories` seeds today; `deposit` and the app-only entries are `seeded: false`.

- [ ] **Step 1: Write failing tests** (`category-catalog.spec.ts`): every entry has all nine non-empty names; no `(type, normalized name)` maps to two keys; `getDefaultCategories(lang)` output for every locale equals the pre-change output (snapshot the current lists in the test before refactoring); `catalogKeyForName('Zakupy spożywcze','expense') === 'groceries'`, `('Health & Fitness','expense') === 'health'`, `('Gifts','income') === 'gifts'` and `('Gifts','expense') === 'gifts'` are different entries by type, `(' groceries ','expense') === 'groceries'`, `('Groceries','income') === null`; `catalogEntry('deposit','expense').names` equals `DEPOSIT_CATEGORY_NAMES` from `deposit-category.ts`.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/common/utils/category-catalog.spec.ts src/modules/accounts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the catalog and the `default-categories.ts` refactor; update `category-equivalence.ts` to use `catalogKeyForName` (same behaviour, its spec must still pass).
- [ ] **Step 4: Run** `cd apps/api && npx jest src/common/utils src/modules/accounts` — Expected: PASS.
- [ ] **Step 5: Mirror** to shared-utils, export it, write the parity test (reads both files' text after the header and asserts equality). Run `cd apps/mobile && npx jest src/features/categories/__tests__/categoryCatalogParity.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(categories): keyed category catalog`.

### Task 2: Schema, migration and backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Category.systemKey String? @map("system_key")`, `nameCustomized Boolean @default(false) @map("name_customized")`)
- Create: `apps/api/prisma/migrations/20261027000000_category_system_keys/migration.sql` (columns, partial unique index `categories_account_system_key_type_live_key`, backfill)
- Create: `apps/api/scripts/generate-category-key-backfill.ts` (prints the backfill's `(type, lower(name), key)` VALUES list from the catalog) and `apps/api/src/common/utils/category-key-backfill.spec.ts`
- Modify: `packages/shared-types/src/entities/category.ts` (`systemKey?: string | null; nameCustomized?: boolean`)

**Interfaces:**
- Consumes: Task 1 `CATEGORY_CATALOG`.
- Produces: the two columns, populated for existing data.

- [ ] **Step 1: Write failing test** `category-key-backfill.spec.ts`: reads `migration.sql`, extracts the VALUES list, and asserts it equals the generator's output for the current catalog (the migration's static table can never drift from the catalog it was built from).
- [ ] **Step 2: Run** it — Expected: FAIL (file missing).
- [ ] **Step 3: Write the migration**: add columns; create the partial unique index; backfill in one statement — candidates = live categories whose account has no E2EE (`accounts.encryption_tier` is 0 or null — confirm the column name in `schema.prisma`) and whose `(type, lower(trim(name)))` is in the VALUES table; rank per `(account_id, key, type)` by expense count desc, `created_at` asc; set `system_key` on rank 1 only. Generate the VALUES list with the script; run `npx prisma generate`.
- [ ] **Step 4: Run** the spec — Expected: PASS. Run `npm run typecheck` at the root — Expected: clean.
- [ ] **Step 5: Commit** `feat(categories): system_key and name_customized with backfill` (schema + migration in the same commit).
- [ ] **Step 6: Dry run (read-only, controller)** — the backfill's SELECT (without the UPDATE) through the `prod_query` tool: rows that would be keyed, accounts affected, candidates left keyless as duplicates. Record the counts in the task report; no production write.

### Task 3: Server write rules and payloads

**Files:**
- Modify: `apps/api/src/modules/categories/categories.service.ts` (`create`, `update`, `reuseExisting`), `dto/index.ts` (no `systemKey`/`nameCustomized` accepted)
- Modify: `apps/api/src/modules/accounts/accounts.service.ts` (`createDefaultAccount` seeds with `systemKey`)
- Modify: `apps/api/src/modules/sync/` category handler (ignore incoming key fields; never clear the key)
- Create: `apps/api/src/common/utils/category-key.util.ts` + spec
- Modify: `expense-category-resolver.util.ts`, `import-bank-category.util.ts`, `categorize-bot.service.ts` (automatic creation through the key rule), `category-equivalence.ts`
- Test: `categories.service.spec.ts`, the sync handler's spec, the three callers' specs

**Interfaces:**
- Consumes: Task 1 `catalogKeyForName`, Task 2 columns.
- Produces:
  ```ts
  // category-key.util.ts
  export function findKeyedCategory<T extends { id: string; name: string; type: string; systemKey?: string | null }>(candidateName: string, type: 'expense' | 'income', existing: readonly T[]): T | null;
  export async function createOrReuseKeyed(prisma: PrismaService, data: { accountId: string; userId?: string; name: string; type: 'expense' | 'income'; icon?: string; color?: string; parentId?: string | null; clientId?: string }): Promise<Category>;
  ```
  `findKeyedCategory`: candidate key = `catalogKeyForName(candidateName, type)`; match a row with that `systemKey`, else a keyless row whose name maps to the same key, else a row whose normalized name equals the candidate. `createOrReuseKeyed`: reuse via `findKeyedCategory` over the account's live rows of that type; else create with `systemKey` = candidate key (or null); on P2002 re-read and return the winner. `findEquivalentCategory` becomes a thin wrapper over `findKeyedCategory`.

- [ ] **Step 1: Write failing tests**: `create({name:'Groceries'})` on an account holding keyed `Zakupy spożywcze` returns that row; `create({name:'Zakupy spożywcze'})` on an empty account stores `systemKey:'groceries'`; `create({name:'Piwo'})` stores `systemKey:null`; "rename of a keyed row sets nameCustomized even without any new field"; update with `systemKey` in the body leaves the key unchanged; "category upsert without systemKey keeps the stored key" (sync); "P2002 on the key index re-reads the winner"; `createDefaultAccount('pl')` seeds rows whose keys equal the seeded catalog keys; resolver/import/categorize-bot each reuse the keyed row for a translated name and create keyed rows for a new catalog name.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/categories src/modules/accounts src/modules/sync src/modules/expenses src/modules/import-bank src/modules/ai/services/categorize-bot src/common/utils` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the util and route `CategoriesService.create`, the resolver's auto-create, `preloadCategories` and `applyStep` through `createOrReuseKeyed`; the rename rule in `update`; strip key fields from DTOs and the sync payload.
- [ ] **Step 4: Run** the same command — Expected: PASS; then the full `cd apps/api && npx jest` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(categories): server assigns and honours system keys`.

### Task 4: Key-based lookups in receipts and default ids

**Files:**
- Modify: `apps/api/src/modules/ai/services/receipt-finalizer.service.ts` (deposit: `systemKey === 'deposit'` first, then ABA-697's any-language name match; a new deposit category is proposed under the owner-language catalog name and created with key `deposit`)
- Modify: `apps/api/src/modules/ai/services/receipt-category-split.service.ts` (deposit exclusion by key OR name; "standard names" = seeded catalog entries whose key the account does not have, named in the request language)
- Modify: `apps/api/src/modules/expenses/expense-category-resolver.util.ts` (`default-exp-<slug>`/`default-inc-<slug>` resolve through the catalog: slug → key → the account's row with that key, before the existing word-contains fallback)
- Test: `receipt-finalizer.service.spec.ts`, `receipt-category-split.service.spec.ts`, `expenses.service.spec.ts` / resolver spec

**Interfaces:**
- Consumes: Task 1 catalog, Task 3 `createOrReuseKeyed`.

- [ ] **Step 1: Write failing tests**: a keyed deposit row named anything (e.g. a renamed "Zwrotne butelki", `nameCustomized:true`) is the deposit group; standard names exclude `groceries` when the account has a keyed row named in another language; `default-exp-groceries` resolves to the account's keyed groceries row named in Polish.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/ai src/modules/expenses` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(receipts): deposit and standard categories found by system key`.

### Task 5: App — storage, sync, seeds, display (phone + desktop)

**Files:**
- Modify: `apps/mobile/src/db/schema/index.ts`, `src/db/client.native.ts` (guarded `ALTER TABLE categories ADD COLUMN system_key TEXT` / `name_customized INTEGER DEFAULT 0`, following the existing pattern), `src/db/categoryRepository.ts` (map both fields)
- Modify: `apps/mobile/src/stores/categoryStore.ts` (seed rows carry `systemKey`; legacy convergence matches by key before name; `updateCategory` with a `name` sets `nameCustomized: true` locally; the seed lists come from the catalog's seeded entries — no own English list)
- Modify: `apps/mobile/src/utils/categoryDisplayName.ts` (`getCategoryDisplayName(category, t)` per the display rule using `catalogName(key, type, i18n.language)`; `SYSTEM_CATEGORY_KEYS` removed) and `src/utils/entityLabel.ts` `categoryLabel` (same rule)
- Modify: `packages/shared-utils/src/constants/index.ts` `DEFAULT_EXPENSE_CATEGORIES`/`DEFAULT_INCOME_CATEGORIES` — derive from the catalog or remove if unused (check consumers)
- Test: `src/utils/__tests__/categoryDisplayName.test.ts`, `src/stores/__tests__/categoryStoreLegacyConvergence.test.ts`, `categoryStoreUpdate.test.ts`

**Interfaces:**
- Consumes: Task 1 `catalogName`, `CATEGORY_CATALOG` from `@budget/shared-utils`; Task 2 `Category.systemKey/nameCustomized`.

- [ ] **Step 1: Write failing tests** — `getCategoryDisplayName`: keyed + not customized shows the catalog name in the current language (`pl` → `Zakupy spożywcze` for a row stored as "Groceries"); keyed + customized shows `name`; no key shows `name`; unknown key shows `name`. Store: "converges a seed with the server row of the same key" (one row remains, expenses re-pointed by the existing merge); a rename sets `nameCustomized` locally; seeds carry keys.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest src/utils src/stores/__tests__/categoryStore` — Expected: FAIL.
- [ ] **Step 3: Implement.** Every screen that shows a category name already goes through `getCategoryDisplayName`/`categoryLabel`; grep for direct `category.name` / `.categoryName` renders in `src/components` and `app/` and route the user-visible ones through `categoryLabel` (phone and `desktop/` components alike).
- [ ] **Step 4: Run** `cd apps/mobile && npx jest` and `npm run typecheck` at the root — Expected: all pass.
- [ ] **Step 5: Commit** `feat(categories): app shows standard categories in the UI language`.

### Task 6: Docs

**Files:**
- Create: `docs/wiki/features/category-system-keys.md` (what a key is, the display rule, server-owned keys, backfill rules, E2EE exclusion, Known gaps: server-generated text — push notifications, bot replies, chat answers, report files — still shows the stored `name`; no "reset to standard name"), linked from `docs/wiki/index.md`; cross-links from `category-hierarchy.md` and `receipt-category-split.md`
- Modify: `docs/wiki/log.md`; `user_docs/<lang>/11-settings.md` in all nine locales (standard categories follow the app language unless renamed), then `npm run generate:help`

- [ ] **Step 1:** Write; **Step 2:** `python scripts/wiki-lint.py` — Expected: `no findings`; **Step 3:** `npm run generate:help` — Expected: regenerated; **Step 4:** Commit `docs: category system keys`.
