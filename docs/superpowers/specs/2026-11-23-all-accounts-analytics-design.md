# All-accounts analytics — design

Date: 2026-11-23. Status: approved scope (all four parts), tiers approved, approach A approved.

## Intent

Analytics, budgets and category totals are computed one account at a time. A user who keeps
several accounts — the trigger was a customer with one account per rental/renovation property,
each with its own categories — cannot see what they spent and earned across all of them. The only
cross-account view today is Net worth (ABA-799), which shows balances, not spending.

We told that customer we are building it and offered four parts; we build all four, for every
user (families with a personal + shared account, freelancers with a business account, trips):

1. **Overview** — spent, income and net for any period across all accounts, one row per account,
   a monthly chart.
2. **Combined categories** — the same, with spending grouped by category across accounts
   ("Obras" from every property as one figure).
3. **Account groups** — a saved, named set of accounts ("Imóveis") compared side by side:
   income (rent), costs, result per account.
4. **Consolidated report** — one PDF / Excel / CSV for all or selected accounts and a period,
   with per-account subtotals and a grand total (accountant, tax return).

Phone and desktop web (≥1024) ship together (repo rule).

## Goals

- One server engine computes every figure; the four parts are views over it, so the screen and
  the file never disagree.
- For a single included account, totals equal that account's Analytics tab for the same period.
- Every amount converted to the caller's display currency (`user.currencyCode`) before summing;
  an unknown rate is excluded and flagged `fxApproximate` (`docs/wiki/features/display-currency-conversion.md`).
- Money moved between the user's own accounts is never counted as both spend and income.

## Non-goals

- Cross-account budgets, chat tools, bot commands, public API / MCP exposure.
- "Only my share" of a shared account (possible later via `Expense.userId`/`paidByUserId`).
- Scheduled e-mail delivery of the consolidated report.
- Financial-month anchors: months are calendar months (accounts may have different anchors).
- Category drill-down below the merged row (children, transactions list) in v1.

## Anti-goals (failure even if it "works")

- Summing currencies unconverted, or counting a `countAsIncome` transfer as income when its
  source account is also included.
- Showing a zero/empty state when the load failed (`docs/wiki/features/web-data-loading.md`).
- Any figure from an account the caller is not a member of — `exclude`/`accounts` params are
  filters over memberships, never an allow-list.
- Breaking the per-account Analytics tab or Reports screen.

## Constraints

- No device computation: web has no SQLite and the Analytics tab only holds the current
  account's data (`docs/wiki/features/web-data-loading.md`). All four parts are server-computed.
- User-scoped endpoints follow Net worth: `JwtAuthGuard` only, enumerate `AccountMember` rows,
  never read `req.accountId` (`apps/api/src/modules/insights/net-worth.controller.ts`).
- Schema change lands with its migration in the same commit (CLAUDE.md, ABA-558).
- No runtime imports from `@budget/shared-*` in `apps/api`.
- i18n in all 11 locales; new screens have a header; platform split is component-level
  (`.web.tsx` sibling), never route-level.
- Help: extend existing sections `user_docs/*/06-analytics.md` and `16-export-reports.md`
  (no new section registration needed), then `npm run generate:help` and rebuild the help site
  with `LANDING_BASE= ROBOTS="index,follow,max-image-preview:large"`.

## Approaches considered

- **A. One server engine "across accounts" (chosen).** A new service computes spend/income per
  (account, merged category, month) in the display currency with all inclusion rules in one
  place; overview, categories and groups are slices of its response, the report prints its rows.
  Replaces the dormant, incorrect `GET /analytics/aggregated`.
- **B. Teach existing analytics to accept an account list.** Rejected: touches every analytics
  query and the one-account guard semantics, risks the working per-account screens, and the
  report would still be separate.
- **C. Aggregate on the device from per-account calls.** Rejected: currency conversion and
  category merging duplicated in app and web, and N requests hit the web proxy rate limit.

## Decided design

### Engine (API)

New module `apps/api/src/modules/all-accounts/` (user-scoped, `JwtAuthGuard` only).

`GET /all-accounts/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&exclude=a,b` or `&groupId=…`
(free on every tier, except that `groupId` requires Pro — see Tiers). Also returns the same data
for the previous period of equal length for the per-account change figure.

Inclusion rules:

- Accounts = the caller's memberships (any role, viewers included — read only).
- `exclude` removes accounts; `groupId` restricts to that group's accounts ∩ memberships.
- `encryptionTier >= 2`: listed, `encrypted: true`, no figures.
- `encryptionTier == 1`: amounts counted; categories merge as described under the merged
  category key (only unreadable names go to "Other").
- Investment accounts are off by default on the client (see Client), not on the server.
- Expenses: `isDeleted: false`, `isPlanned: false`, `...EXCLUDE_SPLIT_RECEIVABLE`; `isDebt` rows
  kept (a cash loan is the outflow), matching the per-account screens.
- Incomes: `isDeleted: false`, `...EXCLUDE_SPLIT_RECEIVABLE`; an income that is the
  `linkedIncome` of an `AccountTransfer` with `countAsIncome` is excluded when that transfer's
  `fromAccountId` is also included. `AccountTransfer` itself is never spend or income.
- Category attribution is split-aware through `attributeToCategories`
  (`apps/api/src/common/utils/category-attribution.ts`).
- Conversion through `apps/api/src/common/utils/fx.ts` (today's rates, as Reports do).

Merged category key — **merge by the name the user sees** (decided 2026-11-23):

1. Roll the category up to its top-level parent first (merge at the top level).
2. Displayed name = the category's own `name` when `nameCustomized` is true or it has no
   `systemKey`; otherwise the catalog name for its `systemKey` in the caller's language
   (`user.language`, from the server-side catalog behind `catalogKeyForName` in
   `apps/api/src/common/utils/category-catalog.ts`).
3. Key = `type` + `normalizeCategoryName(displayed name)`
   (`apps/api/src/common/utils/category-key.util.ts`).

So a renamed system category "Obras" in one property and a hand-made "Obras" in another become
one row — the customer's case. Accepted trade-off: two different categories the user gave the same
name merge too. The response carries the displayed name (already localized) and the `systemKey`.

Tier-1 accounts (category `name` encrypted, `systemKey` plaintext): an uncustomized keyed
category merges normally through its catalog name; a customized or keyless one (name unreadable)
goes to the merged "Other" row.

Response (shape for the builder to refine in `packages/shared-types`):

```
currencyCode, start, end, fxApproximate, computedAt
totals: { spent, income, net }
accounts[]: { id, name, type, included, encrypted, spent, income, net, prevSpent, prevIncome }
months[]:   { month: 'YYYY-MM', perAccount: { [accountId]: { spent, income } } }
expenseCategories[]: { key, name, systemKey|null, total, perAccount: { [accountId]: amount } }
incomeCategories[]:  same shape
```

Cache: Redis key `aa:{userId}:{currency}:{start}:{end}:{sorted included ids}`, short TTL
(≈2 min) — no write-path invalidation.

Max period: 3 years (400 for longer).

Remove `AnalyticsService.getAggregatedSummary`, its controller route and its spec case.

### Account groups (API)

New Prisma models with migration:

- `AccountGroup { id, userId, name, createdAt, updatedAt }` — per user, not per account.
- `AccountGroupAccount { groupId, accountId }` — cascade on both group and account delete.

`GET/POST/PATCH/DELETE /account-groups` (user-scoped). Write: every accountId must be a current
membership of the caller. Read: members are re-filtered by current membership. Limit 20 groups
per user, 1–100 chars name, at least 1 account.

### Consolidated report (API)

- `GeneratedReport.accountId` becomes nullable; add `accountIds String[]` (migration). A report
  with `accountId = null` is "consolidated" and owned by `userId` alone.
- `POST /all-accounts/reports` (user-scoped) with the existing `GenerateReportDto` fields minus
  category/tag/project filters, plus `exclude` or `groupId`. Download/delete of a consolidated
  report check `userId` only.
- The file LISTS every recorded row of the included accounts (a ledger, as the per-account report
  does), with a **Note** column marking rows kept out of all totals: planned expenses, split
  receivables, and `countAsIncome` transfer incomes whose source account is included. Totals and
  subtotals use exactly the engine's inclusion rules, so they equal the screen. (Our call.)
- The per-account report is NOT changed here. Known divergence: it still counts planned expenses
  in its totals — a pre-existing bug, fixed as a separate follow-up task.
- Files get an **Account** column,
  per-account subtotals (spent, income, net), a grand total, and the merged category table.
  Tier-2 accounts are named in the summary as "not included (encrypted)".
- The Reports screen's history list shows the account's reports plus the caller's consolidated
  reports.

### Tiers

- Overview, combined categories, consolidated report: free (Net worth and Reports are free).
- Account groups (create/edit, and `groupId` reads): Pro, via `@RequireTier('pro')` and the one
  `UpgradeGate`. A downgraded user keeps their groups; they are hidden until the user upgrades again (GET /account-groups is Pro-gated).

### Client (mobile + web)

- **Entry points:** a discovery item "All accounts" in `discoveryItems.ts` (both layouts) and a
  link from the Net worth screen. Shown only when the user has ≥2 accounts.
- **Route** `app/all-accounts/index.tsx` (thin) → `src/components/all-accounts/AllAccountsView.tsx`
  + `AllAccountsView.web.tsx` (decides on width).
- **Phone:** header; period picker (this month / last month / this year / last year / custom);
  three tiles (spent, income, net); segmented control **Accounts | Categories**:
  - Accounts: rows with spent / income / net, change vs previous period, share bar; tap opens that
    account's Analytics (switching current account). Account chips toggle inclusion; encrypted
    ones greyed with a note; shared accounts carry a "whole account counted" hint.
  - Categories: expense donut + rows; a row expands to per-account amounts. Income categories
    below.
  - Monthly stacked bar chart, one colour per account.
  - Groups strip: "All" + saved groups + "New group" (Pro gate).
- **Desktop:** summary strip, sortable account table beside the monthly chart, category × account
  matrix, groups as a tab row; reuse `components/analytics/desktop/` building blocks.
- **Group screen** `app/all-accounts/group/[id].tsx`: comparison table — one row per account with
  income, costs, result; group totals; per-month result chart; edit/delete group. Desktop: wide
  table, one column per month.
- **Inclusion toggles** persist per device (MMKV, separate from Net worth's), like Net worth.
  Investment accounts default off.
- **Reports screen:** a "Scope: this account / all accounts / a group" control; the latter two
  call the consolidated endpoint.
- Failed load → retry, never zeros. `fxApproximate` → a note.

## Left to the builder

- Exact query strategy (groupBy vs row fetch) within the 3-year cap; must not be N+1 per account.
- Chart components (reuse existing gifted-charts patterns), colours per account.
- Exact i18n key names and copy (no "overcharged"-style claims; plain language).
- Whether the previous-period comparison is a second compute call or one wider query.
- Test layout: engine unit tests for every inclusion rule (transfer-as-income, planned, split
  receivable, tier 1/2, currency, membership filter, group filter), controller authorization
  tests, report generator tests for the account column and subtotals.
