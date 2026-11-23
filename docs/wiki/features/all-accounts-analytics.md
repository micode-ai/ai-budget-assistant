# All-accounts analytics

*Hub: [analytics-insights](../analytics-insights.md) · related: [net-worth](net-worth.md), [report-periods](report-periods.md), [display-currency-conversion](display-currency-conversion.md)*

## What this is

Spending and income across every account the user belongs to, in the display currency, for a chosen
period: totals with a previous-period comparison, a row per account, categories merged by name, monthly
stacked bars, optional **account groups** (Pro) compared side by side, and one consolidated PDF / Excel /
CSV report (this account, all accounts, or a group) whose figures match the screen.

## Entry points

- API: `apps/api/src/modules/all-accounts/` — `all-accounts.controller.ts` (`GET /all-accounts/analytics`,
  `POST /all-accounts/reports`), `account-groups.controller.ts` (`/account-groups` CRUD plus
  `GET /account-groups/:id/analytics`, all Pro), `all-accounts.service.ts` (`loadLedger`),
  pure `all-accounts.util.ts` (`aggregateLedger`), `consolidated-report.service.ts`
- App: `app/all-accounts` → `src/components/all-accounts/` (`AllAccountsView` + `.web` desktop variant,
  `GroupComparisonView`), `src/features/all-accounts/` (`useAllAccounts`, `useAccountGroups`,
  `allAccountsDisplay.ts`); report scope chooser `src/components/reports/ReportScopePicker.tsx`
  (`app/reports.tsx`); entries on the Analytics tab (`discoveryItems.ts`) and the Net worth screen
- Design: `docs/superpowers/specs/2026-11-23-all-accounts-analytics-design.md`

## Key concepts

**One ledger feeds screen and file.** `loadLedger` produces `LedgerRow`s (expense or income, with an
optional `note`); `aggregateLedger` turns them into totals, per-account figures, merged categories and
monthly buckets. The screen and the consolidated report both call these two, so a file can never disagree
with the screen.

**Noted rows.** A row carries a note — `planned`, `splitReceivable`, or `internalTransfer` (a
`countAsIncome` transfer between two included accounts) — when it must be shown but not summed. Noted rows
are listed in the file (the **Note** column) and counted in no total.

**Categories merge by displayed name.** The key is the name the user sees: the system catalog name in
`user.language` for a system category, the stored name when `nameCustomized`. Two accounts' "Groceries"
become one row; a subcategory rolls up to its parent.

**Scope.** Membership only: the user's memberships are enumerated, and `exclude` / `onlyAccountIds` (a
group's accounts) only narrow that set. Accounts at `encryptionTier >= 2` are listed but never queried. The
device keeps the exclude list (investment accounts are excluded until the user chooses otherwise).

**Groups.** `AccountGroup` is per user, at most 20, Pro only. Its accounts are re-filtered by current
membership on every read, so a left account silently drops out.

**Consolidated report.** `accountId` is null and `accountIds` holds the included set; the row is owned by
`userId`, so it opens from any account context. It expires after 7 days like any report.

## Invariants

- Membership is the only scope. `exclude` and a group's ids are filters over the caller's memberships,
  never an allow-list — an id the caller does not belong to must never be summed.
- The screen and the file come from the same `loadLedger` + `aggregateLedger`; do not compute totals a
  second way.
- A noted row (planned, split receivable, internal transfer between included accounts) is listed but
  never added to a total.
- Categories merge by displayed name (system names in `user.language`, customized names as stored), never
  by id.
- Tier-2 accounts are never queried. On a tier-1 account an unreadable category name falls to **Other**
  and the file prints an empty description.
- Groups are Pro (`@RequireTier('pro')` on the routes; the report service repeats the check with the same
  `TIER_REQUIRED` body for `groupId`), capped at 20, and re-filtered by membership on read. A downgraded user keeps their groups; they are hidden until the
  user upgrades again (`GET /account-groups` is Pro-gated).
- A consolidated report has `accountId = null`, is owned by `userId`, and keeps the data of an account
  the user later left until it expires (7 days).
- Amounts convert through `common/utils/fx.ts`; one without a rate is left out and flags
  `fxApproximate`.

## Known gaps

- The per-account report still counts planned expenses in its totals
  ([ABA-837](https://github.com/micode-ai/ai-budget-assistant/issues/875)); only the
  consolidated report notes them.
- Totals are not cached; every open recomputes.

## History

[ABA-836](https://github.com/micode-ai/ai-budget-assistant/issues/874) — the endpoints, groups, the
screens (phone and desktop) and the consolidated report.
[ABA-837](https://github.com/micode-ai/ai-budget-assistant/issues/875) — follow-up: per-account report counts planned expenses.
