# All-Accounts Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spending and income across all of a user's accounts — overview, merged categories, Pro account groups with side-by-side comparison, and a consolidated PDF/Excel/CSV report — on phone and desktop web.

**Architecture:** One user-scoped server engine (`apps/api/src/modules/all-accounts/`) loads a *ledger* of the included accounts' rows, marks the ones kept out of totals, converts to the display currency and merges categories by displayed name; the analytics response and the consolidated report are both built from that ledger. The client is thin: hooks over the endpoints plus a phone view and a `.web.tsx` desktop view.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, Redis (`CacheService`), Jest; Expo 54 / React Native, react-native-mmkv, i18next.

**Spec:** `docs/superpowers/specs/2026-11-23-all-accounts-analytics-design.md`

## Global Constraints

- User-scoped endpoints: `@UseGuards(JwtAuthGuard)` only; never read `req.accountId`; accounts = `AccountMember` rows of `req.user.id`; `exclude`/group ids are filters over memberships, never an allow-list.
- Display currency = `req.user.currencyCode || 'USD'`; convert with `apps/api/src/common/utils/fx.ts` (`getRatesSafe`, `convertAmount`); a `null` conversion → excluded from sums, `fxApproximate: true`.
- Expense totals: `isDeleted:false`, `isPlanned:false`, not split-receivable; incomes: `isDeleted:false`, not split-receivable, not a `countAsIncome` transfer's `linkedIncome` whose `fromAccountId` is included. `isDebt` rows count.
- `encryptionTier >= 2` → listed `encrypted:true`, no figures, no rows.
- Max period 3 years: `end - start ≤ 1096 days`, else 400. Dates are `YYYY-MM-DD`, read as calendar days (`@db.Date` = UTC midnight).
- Months are calendar months `YYYY-MM`.
- Cache TTL 120 s, key `aa:{userId}:{currency}:{language}:{start}:{end}:{sorted included ids}`.
- Groups: Pro (`@RequireTier('pro')` + `SubscriptionTierGuard`), ≤ 20 per user, name 1–100 chars, ≥ 1 account.
- No runtime import of `@budget/shared-*` in `apps/api` (`import type` only).
- `schema.prisma` change and its migration in the same commit.
- i18n: every new key in all 11 locales (`en de es fr pl ru ua be nl pt br`), namespace `allAccounts`.
- New screens have a header (`Stack.Screen` in `apps/mobile/app/_layout.tsx`, as `net-worth`). Platform split is a `.web.tsx` sibling component, never a route file. A bottom-anchored `Modal` adds `insets.bottom`.
- Failed load → retry UI, never zeros. Offline failures `console.warn`, never `console.error`.
- Commits: WIP commits per task are fine; the last task squashes the whole feature into ONE `ABA-{N}` commit. Never push without the user's explicit "yes".

## Review Focus

1. **A user who lost membership of an account still in a saved group** → that account silently disappears from the group's figures (no 403, no leak). Test in Task 3.
2. **A transfer marked as income between two included accounts** → counted once (out of source, NOT as income in target); with the source excluded, it IS income. Test in Task 2.
3. **A month in the period with no rows** → still present in `months[]` with zeros, so the chart has no gaps. Test in Task 1.
4. **A period of one day / `start === end`** and **an `end` before `start`** → one-day period works; reversed is 400. Test in Task 2.
5. **Two "Obras" categories, one renamed system category (`nameCustomized:true`), one custom, in different accounts, plus an uncustomized system "Home" in a third** → the two "Obras" merge into one row; "Home" stays its own row named in the caller's language. Test in Task 1.

---

### Task 1: Shared types and the pure aggregation engine

**Files:**
- Create: `packages/shared-types/src/dto/all-accounts.ts` (export from `packages/shared-types/src/dto/index.ts`)
- Create: `apps/api/src/modules/all-accounts/all-accounts.types.ts`
- Create: `apps/api/src/modules/all-accounts/all-accounts.util.ts`
- Test: `apps/api/src/modules/all-accounts/all-accounts.util.spec.ts`

**Interfaces:**
- Produces (shared-types):
  ```ts
  export interface AllAccountsMoney { spent: number; income: number; net: number }
  export interface AllAccountsAccountRow extends AllAccountsMoney {
    id: string; name: string; type: AccountType; role: AccountRole;
    included: boolean; encrypted: boolean; shared: boolean; // shared = type shared|trip or >1 member
    prevSpent: number | null; prevIncome: number | null;     // null when not included/encrypted
  }
  export interface AllAccountsMonth { month: string; perAccount: Record<string, { spent: number; income: number }> }
  export interface AllAccountsCategoryRow { key: string; name: string; systemKey: string | null; total: number; perAccount: Record<string, number> }
  export interface AllAccountsAnalyticsResponse {
    currencyCode: string; start: string; end: string; groupId: string | null;
    fxApproximate: boolean; computedAt: string;
    totals: AllAccountsMoney; accounts: AllAccountsAccountRow[]; months: AllAccountsMonth[];
    expenseCategories: AllAccountsCategoryRow[]; incomeCategories: AllAccountsCategoryRow[];
  }
  export interface AccountGroupDto { id: string; name: string; accountIds: string[] }
  export interface UpsertAccountGroupDto { name: string; accountIds: string[] }
  export interface ConsolidatedReportRequest {
    format: 'csv' | 'pdf' | 'excel'; startDate: string; endDate: string;
    includeIncomes?: boolean; includeExpenses?: boolean; locale?: string;
    exclude?: string[]; groupId?: string;
  }
  ```
- Produces (API, `all-accounts.types.ts`):
  ```ts
  export type LedgerNote = 'planned' | 'splitReceivable' | 'internalTransfer' | null;
  export interface MergedCategory { key: string; name: string; systemKey: string | null }
  export interface LedgerRow {
    accountId: string; kind: 'expense' | 'income'; date: string /* YYYY-MM-DD */;
    description: string; amount: number; currencyCode: string;
    amountBase: number | null;   // null = no rate
    category: MergedCategory; note: LedgerNote;
  }
  ```
- Produces (API, `all-accounts.util.ts`):
  - `mergedCategory(cat: { name: string; systemKey: string | null; nameCustomized: boolean; type: 'expense'|'income'; parent: {…same fields} | null } | null, opts: { language: string; namesReadable: boolean }): MergedCategory`
  - `monthsBetween(start: string, end: string): string[]`
  - `previousPeriod(start: string, end: string): { start: string; end: string }`
  - `aggregateLedger(rows: LedgerRow[], accountIds: string[], start: string, end: string): { totals: AllAccountsMoney; perAccount: Record<string, AllAccountsMoney>; months: AllAccountsMonth[]; expenseCategories: AllAccountsCategoryRow[]; incomeCategories: AllAccountsCategoryRow[]; fxApproximate: boolean }`

- [ ] **Step 1: Write the failing tests** in `all-accounts.util.spec.ts`:
  - `mergedCategory`: rolls up to `parent` first; `nameCustomized:true` → key `expense:obras` from its own name; custom (no systemKey) "Obras " → same key `expense:obras`; uncustomized `systemKey:'home'` with `language:'pt'` → name = `catalogName('home','expense','pt')`, key `expense:` + normalized catalog name; `namesReadable:false` + customized/keyless → `{ key: 'expense:__other', name: '', systemKey: null }`; `namesReadable:false` + uncustomized keyed → merges normally; `null` category → `__other`.
  - `monthsBetween('2026-01-15','2026-03-02')` → `['2026-01','2026-02','2026-03']`.
  - `previousPeriod('2026-11-01','2026-11-30')` → `{ start:'2026-10-02', end:'2026-10-31' }` (same day count, ends the day before `start`).
  - `aggregateLedger`: rows with `note !== null` change no total; rows with `amountBase === null` change no total and set `fxApproximate`; a month with no rows still appears with `perAccount` zeros for every id in `accountIds`; categories sorted by `total` desc; `net = income - spent`.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/all-accounts/all-accounts.util.spec.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the shared types and the three functions. `mergedCategory` uses `normalizeCategoryName` from `apps/api/src/common/utils/category-key.util.ts` and `catalogName` from `apps/api/src/common/utils/category-catalog.ts` (fall back to the stored name when the catalog has no entry). Key format: `` `${type}:${normalized}` ``.
- [ ] **Step 4: Run** the same command — Expected: PASS. Also `npm run typecheck -w packages/shared-types` (or root `npm run typecheck`) passes.
- [ ] **Step 5: Commit** `git commit -m "WIP all-accounts: types and aggregation engine"`.

### Task 2: Ledger loader, service, `GET /all-accounts/analytics`; retire `/analytics/aggregated`

**Files:**
- Create: `apps/api/src/modules/all-accounts/all-accounts.service.ts`
- Create: `apps/api/src/modules/all-accounts/all-accounts.controller.ts`
- Create: `apps/api/src/modules/all-accounts/all-accounts.module.ts` (register in `apps/api/src/app.module.ts`)
- Modify: `apps/api/src/modules/analytics/analytics.controller.ts` (remove `@Get('aggregated')`), `analytics.service.ts` (remove `getAggregatedSummary` and its now-unused helpers), `apps/api/src/common/utils/income-split-receivable.spec.ts` (remove its `getAggregatedSummary` case)
- Test: `apps/api/src/modules/all-accounts/all-accounts.service.spec.ts`, `all-accounts.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 types and functions.
- Produces:
  - `AllAccountsService.loadLedger(userId: string, base: string, language: string, start: string, end: string, filter: { exclude: string[]; onlyAccountIds: string[] | null }): Promise<{ accounts: AccountMeta[]; includedIds: string[]; rows: LedgerRow[] }>` where `AccountMeta = { id; name; type; role; encrypted; shared; included }`.
  - `AllAccountsService.getAnalytics(user: { id: string; currencyCode: string }, q: { start: string; end: string; exclude: string[]; onlyAccountIds: string[] | null; groupId: string | null }): Promise<AllAccountsAnalyticsResponse>` (cached; computes current and `previousPeriod` ledgers).
  - `parsePeriod(start?: string, end?: string): { start: string; end: string }` (exported from the controller file or util) — throws `BadRequestException` on bad format, `end < start`, or span > 1096 days.
  - Route: `GET /api/v1/all-accounts/analytics?start&end&exclude=a,b` (exclude capped at 100 ids).

- [ ] **Step 1: Write failing service tests** (mocked `PrismaService`, `CacheService`, `ExchangeRateService` as in `apps/api/src/modules/insights/*.spec.ts`):
  - memberships only: an `exclude`/`onlyAccountIds` id the user is not a member of never produces rows;
  - tier-2 account: listed `encrypted:true`, no rows queried for it; tier-1: rows included with `namesReadable:false`;
  - planned expense → row with `note:'planned'`; split-receivable → `'splitReceivable'`;
  - `countAsIncome` transfer A→B with both included → B's linked income has `note:'internalTransfer'`; with A excluded → `note:null`;
  - split expense (has category splits) → one ledger row per `attributeToCategories` share;
  - EUR row with base PLN converted; unknown currency → `amountBase:null`;
  - `getAnalytics` returns `prevSpent/prevIncome` from the previous-period ledger and caches under the key in Global Constraints (second call does not hit Prisma).
- [ ] **Step 2: Write failing controller tests**: `parsePeriod('2026-11-01','2026-11-01')` ok; reversed → 400; `'2023-01-01','2026-11-30'` → 400; `'2026-13-01'` → 400; controller passes `req.user.currencyCode || 'USD'`. `AuthenticatedUser` has no language: `getAnalytics` reads `user.language` with one `prisma.user.findUnique` (default `'en'`) and passes it to `loadLedger` and the cache key.
- [ ] **Step 3: Run** `cd apps/api && npx jest src/modules/all-accounts` — Expected: FAIL.
- [ ] **Step 4: Implement** the service, controller (`@Controller('all-accounts') @UseGuards(JwtAuthGuard)`), module (imports `CurrencyExchangeModule` or whatever provides the existing singleton `ExchangeRateService` — do NOT provide a second one), and app registration. Load rows with `findMany` + minimal `select` for `accountId in includedIds` and the date range (one query per table, not per account); categories with `parent` included; splits via the same relation `attributeToCategories` expects. Remove the aggregated endpoint and its spec case.
- [ ] **Step 5: Run** `cd apps/api && npx jest src/modules/all-accounts src/common/utils/income-split-receivable.spec.ts src/modules/analytics && npx tsc --noEmit -p tsconfig.json` — Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `WIP all-accounts: ledger, analytics endpoint`.

### Task 3: Account groups (schema, CRUD, group analytics)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (+ relations on `User`, `Account`)
- Create: `apps/api/prisma/migrations/20261123120000_account_groups/migration.sql`
- Create: `apps/api/src/modules/all-accounts/account-groups.service.ts`, `account-groups.controller.ts`, `dto/account-groups.dto.ts`
- Test: `apps/api/src/modules/all-accounts/account-groups.service.spec.ts`, `account-groups.controller.spec.ts`

**Interfaces:**
- Consumes: `AllAccountsService.getAnalytics`, `parsePeriod`.
- Produces:
  - Prisma: `AccountGroup { id uuid, userId, name, createdAt, updatedAt; @@index([userId]); @@map("account_groups") }`, `AccountGroupAccount { groupId, accountId; @@id([groupId, accountId]); onDelete: Cascade both; @@map("account_group_accounts") }`.
  - `AccountGroupsService.list(userId): Promise<AccountGroupDto[]>` (accountIds re-filtered by current membership), `create(userId, dto)`, `update(userId, id, dto)`, `remove(userId, id)`, `resolveAccountIds(userId, id): Promise<string[]>` (404 when not the owner's).
  - Routes (all `JwtAuthGuard` + `SubscriptionTierGuard`, `@RequireTier('pro')` on every handler): `GET/POST /account-groups`, `PATCH/DELETE /account-groups/:id`, `GET /account-groups/:id/analytics?start&end` → `getAnalytics({…, onlyAccountIds: resolved, groupId: id, exclude: []})`.
  - DTO class `UpsertAccountGroupBody` with class-validator: `name` string 1–100 (trimmed), `accountIds` `IsUUID('4', {each})`, `ArrayMinSize(1)`, `ArrayMaxSize(100)`.

- [ ] **Step 1: Write failing tests**: create with a non-member account id → 403; 21st group → 400 with message `GROUP_LIMIT`; another user's group id on update/delete/analytics → 404; `list` drops an account id the user is no longer a member of (Review Focus 1); group analytics only includes the group's accounts; handlers carry `@RequireTier('pro')` (assert via `Reflector` metadata as other tier specs do).
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/all-accounts/account-groups` — Expected: FAIL.
- [ ] **Step 3: Add schema + migration** (hand-written SQL matching the models), then `npx prisma generate`. Implement service and controller.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `WIP all-accounts: account groups` (schema + migration in this commit).

### Task 4: Consolidated report

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`GeneratedReport.accountId String?`, `account Account?`, `accountIds String[] @default([]) @map("account_ids")`)
- Create: `apps/api/prisma/migrations/20261123130000_consolidated_reports/migration.sql`
- Create: `apps/api/src/modules/all-accounts/consolidated-report.service.ts`, `dto/consolidated-report.dto.ts`
- Modify: `apps/api/src/modules/all-accounts/all-accounts.controller.ts` (add route), `apps/api/src/modules/reports/reports.module.ts` (export the three generators), `generators/csv-generator.ts`, `excel-generator.ts`, `pdf-generator.ts` (additive optional fields), `reports.service.ts` (list/download/delete scope)
- Test: `consolidated-report.service.spec.ts`, extend `apps/api/src/modules/reports/*.spec.ts` where generators are tested

**Interfaces:**
- Consumes: `AllAccountsService.loadLedger`, `aggregateLedger`, `AccountGroupsService.resolveAccountIds`.
- Produces:
  - `POST /api/v1/all-accounts/reports` body `ConsolidatedReportBody` (class-validator mirror of `ConsolidatedReportRequest`); `groupId` present → caller must be Pro (check via `SubscriptionsService.getOrCreateSubscription` and throw the same 403 body `SubscriptionTierGuard` throws) → response is the existing `GenerateReportResponse`.
  - `ConsolidatedReportService.generate(user, body): Promise<GenerateReportResponse>` — stores `GeneratedReport { accountId: null, accountIds: includedIds, userId, filters: body }`.
  - Generator inputs gain optional `account?: string` and `note?: string` per row, and optional `accountSubtotals?: { name: string; spent: number; income: number; net: number }[]` and `excludedAccounts?: string[]` (names of tier-2 accounts, printed as "not included (encrypted)"). Absent → output byte-identical to today.
  - `ReportsService.listReports/downloadReport/deleteReport` where-clause becomes `{ userId, OR: [{ accountId }, { accountId: null }] }` (+ `id` for the latter two).

- [ ] **Step 1: Write failing tests**: consolidated CSV has an `Account` and `Note` column; a planned row appears with note `planned` and is not in the grand total; per-account subtotals equal `aggregateLedger` per-account figures; grand total equals `totals`; a tier-2 account's name appears in `excludedAccounts`; existing per-account report output unchanged when the new fields are absent (snapshot of current CSV for a fixed input); `listReports` returns the user's consolidated report from any account context and never another user's.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/modules/all-accounts src/modules/reports` — Expected: FAIL.
- [ ] **Step 3: Schema + migration** (`ALTER COLUMN account_id DROP NOT NULL`, add `account_ids text[] NOT NULL DEFAULT '{}'`), `npx prisma generate`, fix any code that assumed a non-null `accountId` (typecheck shows it, e.g. `report-scheduler.service.ts`). Implement.
- [ ] **Step 4: Run** tests + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `WIP all-accounts: consolidated report` (schema + migration in this commit).

### Task 5: Mobile data layer and i18n

**Files:**
- Create: `apps/mobile/src/services/allAccounts.api.ts` (spread into `api` in `apps/mobile/src/services/api.ts`)
- Create: `apps/mobile/src/features/all-accounts/periods.ts`, `allAccountsDisplay.ts`, `useAllAccounts.ts`, `useAccountGroups.ts`
- Modify: all 11 `apps/mobile/src/i18n/locales/*.ts` (namespace `allAccounts`), `apps/mobile/src/stores/reportStore.ts` (+ `generateConsolidatedReport`)
- Test: `apps/mobile/src/features/all-accounts/__tests__/periods.test.ts`, `allAccountsDisplay.test.ts`

**Interfaces:**
- Consumes: Task 1 shared types; routes from Tasks 2–4.
- Produces:
  - `allAccountsApi.getAllAccountsAnalytics(start, end, exclude: string[])`, `getGroupAnalytics(groupId, start, end)`, `listAccountGroups()`, `createAccountGroup(dto)`, `updateAccountGroup(id, dto)`, `deleteAccountGroup(id)`, `generateConsolidatedReport(req: ConsolidatedReportRequest)`.
  - `type PeriodPreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom'`; `periodRange(preset, now: Date, custom?: { start: string; end: string }): { start: string; end: string }` using `toDateInputValue` (never `toISOString`).
  - `changeRatio(cur: number, prev: number | null): number | null` (null when `prev` is null or 0); `accountColor(index: number, theme): string`.
  - `useAllAccounts(opts: { groupId?: string })` → `{ data, failed, loading, reload, preset, setPreset, custom, setCustom, toggleAccount }`; MMKV `id: 'all-accounts'`, key `excluded:${userId}`; when nothing stored, default excluded = ids of the user's `investment` accounts (from `accountStore`). With `groupId`, no toggles.
  - `useAccountGroups()` → `{ groups, failed, reload, create, update, remove }`; a `TIER_REQUIRED` 403 opens `useUpgradeStore.getState().show()`.
  - i18n keys (all locales): `allAccounts.title`, `entrySub`, `spent`, `income`, `net`, `accounts`, `categories`, `incomeCategories`, `byMonth`, `vsPrevious`, `encryptedNotIncluded`, `sharedHint`, `fxApproximate`, `loadFailed`, `period.thisMonth|lastMonth|thisYear|lastYear|custom`, `groups.title|all|new|edit|delete|deleteConfirm|name|pickAccounts|limit|empty`, `group.result`, `group.costs`, `group.rent` (as "Income"), `other`, `reportScope.label|thisAccount|allAccounts|group`, `noData`.
- [ ] **Step 1: Write failing tests** for `periodRange` (lastMonth on 2026-03-31 → `2026-02-01..2026-02-28`; thisYear; custom passthrough) and `changeRatio`.
- [ ] **Step 2: Run** `cd apps/mobile && npx jest src/features/all-accounts` — Expected: FAIL.
- [ ] **Step 3: Implement**; add i18n keys to all 11 locale files (European Portuguese in `pt`, Brazilian in `br`).
- [ ] **Step 4: Run** the tests plus `npx jest src/i18n` (locale parity) and `npx tsc --noEmit` in `apps/mobile` — Expected: PASS.
- [ ] **Step 5: Commit** `WIP all-accounts: mobile data layer`.

### Task 6: Phone screens and entry points

**Files:**
- Create: `apps/mobile/app/all-accounts/index.tsx`, `apps/mobile/app/all-accounts/group/[id].tsx` (thin routes)
- Create: `apps/mobile/src/components/all-accounts/AllAccountsView.tsx`, `AllAccountsMobile.tsx`, `PeriodPicker.tsx`, `TotalsTiles.tsx`, `AccountRows.tsx`, `CategoryRows.tsx`, `MonthlyStackedChart.tsx`, `GroupStrip.tsx`, `GroupEditorSheet.tsx`, `GroupComparisonView.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (two `Stack.Screen` with `headerShown:true`, titles `allAccounts.title` / group name via `navigation.setOptions`), `apps/mobile/src/components/analytics/discoveryItems.ts` (entry `key:'all-accounts'`, icon `layers-outline`, only when the user has ≥ 2 accounts — add a parameter `accountCount: number`), `apps/mobile/src/components/net-worth/NetWorthView.tsx` (link "Spending across accounts")

**Interfaces:**
- Consumes: Task 5 hooks and helpers.
- Produces: `AllAccountsView` (default export-free named component) rendering `AllAccountsMobile`; `GroupComparisonView({ groupId })`.
- Behaviour (spec "Client"): tiles spent/income/net; segmented Accounts | Categories; account rows with change vs previous and share bar, tap → switch current account (`accountStore`) and `router.push('/(tabs)/analytics')`; chips toggle inclusion, encrypted chips disabled with `encryptedNotIncluded`, shared accounts show `sharedHint`; category rows expand to per-account amounts, name through `displayCategoryName` when `systemKey` is set, `__other` → `allAccounts.other`; stacked monthly bars one colour per account; `GroupStrip` (All + groups + New, Pro gate); `GroupEditorSheet` is a bottom `Modal` with `paddingBottom: base + insets.bottom`; group screen = comparison rows (income, costs, result per account), group totals, per-month result bars, edit/delete.
- [ ] **Step 1: Implement** components (no component render tests exist in this repo; logic stays in Task 5's tested helpers).
- [ ] **Step 2: Verify** `cd apps/mobile && npx tsc --noEmit && npx jest` — Expected: PASS. Then run the app on web at phone width (`npm run dev:web`, 390px) signed into a test account with ≥ 2 accounts: overview loads, toggling an account changes totals, category merge visible, group create shows the Pro gate on a free account.
- [ ] **Step 3: Commit** `WIP all-accounts: phone screens`.

### Task 7: Desktop web layout

**Files:**
- Create: `apps/mobile/src/components/all-accounts/AllAccountsView.web.tsx` (width decision via `isDesktopWeb` from `webLayout.constants.ts`; narrow → `AllAccountsMobile`), `desktop/AllAccountsDesktop.tsx`, `desktop/AccountTable.tsx` (sortable), `desktop/CategoryMatrix.tsx`, `desktop/GroupComparisonDesktop.tsx`
- Modify: `GroupComparisonView` gets a `.web.tsx` sibling choosing `GroupComparisonDesktop` at ≥ 1024.

**Interfaces:**
- Consumes: Task 5 hooks; reuse `apps/mobile/src/components/analytics/desktop/AnalyticsSummaryStrip.tsx`, `SummaryTile.tsx`, `BreakdownCard.tsx`.
- Behaviour: summary strip; account table beside the monthly chart; category × account matrix; groups as a tab row; group comparison is a wide table with one column per month. The data hook is called in the platform-neutral `AllAccountsView*` and passed down, so a resize across 1024 doesn't refetch or reset state.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npx tsc --noEmit`; in the browser at 1440px: table sorts, matrix renders, resizing to 800px switches to the phone layout without a reload of data.
- [ ] **Step 3: Commit** `WIP all-accounts: desktop`.

### Task 8: Reports screen scope control

**Files:**
- Modify: `apps/mobile/app/reports.tsx` (if the control pushes the file past readability, extract `src/components/reports/ReportScopePicker.tsx`)

**Interfaces:**
- Consumes: `reportStore.generateConsolidatedReport`, `useAccountGroups`.
- Behaviour: a "Scope" segmented control `thisAccount | allAccounts | group` (group option lists groups; non-Pro → upgrade gate). Non-`thisAccount` hides category/tag/project filters and calls the consolidated endpoint with the stored all-accounts `exclude` list; the history list already includes consolidated reports (Task 4).
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** on web: generate a consolidated CSV, download it, open it — Account and Note columns, subtotals, grand total equal the overview screen for the same period.
- [ ] **Step 3: Commit** `WIP all-accounts: report scope`.

### Task 9: Docs, help, verification, single commit

**Files:**
- Modify: `user_docs/*/06-analytics.md` and `user_docs/*/16-export-reports.md` (11 locales), regenerated `apps/mobile/src/help/content.ts` (via `npm run generate:help`), help site `docs/marketing/help/site` (`git add -f`)
- Create: `docs/wiki/features/all-accounts-analytics.md`; modify `docs/wiki/features/net-worth.md`, `report-periods.md`, `display-currency-conversion.md` (consolidated report uses fx.ts), `docs/wiki/index.md` / hub, `docs/wiki/log.md`
- Create: GitHub issue for the follow-up "per-account report counts planned expenses in totals"

- [ ] **Step 1:** Write the help text (plain language, no flag-gated features). Run `npm run generate:help`, then rebuild the help site with `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/help/build_help.py`.
- [ ] **Step 2:** Run the full gates: `npm run lint && npm run typecheck && npm run test` — Expected: all pass. `python scripts/wiki-lint.py` — no new errors.
- [ ] **Step 3:** Run the `finish-aba-task` skill (issue ABA-{N}, wiki page, log line).
- [ ] **Step 4:** Squash the WIP commits into one: `git reset --soft <base>` then `git commit -m "ABA-{N} All-accounts analytics: overview, merged categories, account groups, consolidated report"` (do not include `.claude/*`). Ask the user before pushing.
