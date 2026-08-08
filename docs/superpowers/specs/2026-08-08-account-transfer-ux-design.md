# Account transfer UX — design

**Date:** 2026-08-08
**Status:** approved
**Scope:** `wallet/transfer.tsx`, `wallet/[id].tsx`, `modules/wallet`, `modules/account-transfers`

## Problem

Transferring money between accounts is inconvenient in three specific ways (confirmed with the
user — the form's length and the exchange/transfer split were explicitly ruled out of scope):

1. **Balances are invisible.** You pick the source account blind. Nothing shows how much is on it,
   whether the amount fits, and there is no "all of it" affordance.
2. **No repeats, no date.** The same monthly transfer is retyped from scratch every time, and the
   date is hardcoded to `new Date()` at the call site — a past transfer cannot be recorded.
3. **Editing cannot change the accounts.** `wallet/[id].tsx` only edits amounts, rate, notes and the
   `countAsIncome` flag. The server agrees: `UpdateAccountTransferDto` and `buildUpdateData` carry
   no account or currency fields.

## Non-goals

- Merging "currency exchange" and "account transfer" into one flow.
- Reducing the number of fields in the create form.
- Automatic recurring transfers (no `recurring*` columns, no cron).
- Named, explicitly saved templates.

## 1. Balances in the form

### API

New `GET /wallet/summaries` on `WalletController`. The class-level `AccountContextGuard` stays; the
handler ignores `req.accountId` and enumerates membership from `req.user.id`:

- `accountMember.findMany({ where: { userId } })` → `accountIds`
- new `WalletService.getSummariesForAccounts(accountIds)` runs the same six aggregates as
  `getSummary`, but with `accountId: { in: accountIds }` and grouped by `accountId + currencyCode` —
  one round trip instead of N.
- Returns `AccountWalletSummary[] = { accountId, summaries: WalletSummary[] }`.

The balance arithmetic (`initial + income − expense + exchangedIn − exchangedOut + transferredIn −
transferredOut`) moves into one pure helper called by **both** `getSummary` and
`getSummariesForAccounts`. Two inline copies would drift on the first edit.

Invariants carried over from `getSummary` and easy to lose in the multi-account rewrite:

- expenses filter through `EXCLUDE_SPLIT_RECEIVABLE`;
- incoming transfers count only when `countAsIncome === false` (otherwise the linked `Income` row
  already counts them and the money is doubled);
- outgoing transfers key on `fromAccountId` + `fromCurrency`, incoming on `toAccountId` +
  `toCurrency`.

No migration.

### Mobile

- `api.getAllWalletSummaries()` in `wallet.api.ts`.
- `walletStore.accountSummaries: Record<string, WalletSummary[]>` + `loadAccountSummaries()`,
  mirrored into MMKV so the form paints numbers immediately instead of after a network round trip.
- The current account's entry is overwritten by the locally computed `walletSummary` — it is exact
  and works offline.

### UI

- Each account chip shows its balance.
- Under the source amount input: `Available: 3 450,00 PLN` plus a **Max** button. The figure is keyed
  to the selected `fromCurrency`, **not** to the account's own currency — the amount is entered in
  `fromCurrency`. No balance in that currency → `0.00`.
- Amount over the available balance → a soft warning. **Submit is not blocked.** This is a tracker:
  transfers get entered after the fact and the local picture of a balance can legitimately be
  incomplete.
- No data / offline → an em dash, never a fabricated zero.

## 2. Frequent-transfer chips

Pure helper `src/features/wallet/frequentTransfers.ts`:

- groups transfer history by `fromAccountId|toAccountId|fromCurrency|toCurrency`;
- ranks by occurrence count, then recency; takes the top 3;
- carries the group's most recent amounts and rate;
- drops groups whose accounts no longer exist or where the user is a `viewer`.

Rendered as a chip row at the top of the create form when at least one group survives. Tapping fills
accounts, currencies, amounts and rate. Notes are **not** copied (they are per-transfer), and the
date stays today. Client-only — no endpoint, no table.

## 3. Date

A date field on both create and edit.

It must go through `src/components/DatePicker.tsx`. Importing
`@react-native-community/datetimepicker` directly is the ABA-381 defect — that package ships no web
implementation, so the field silently renders nothing in the browser.

Nothing changes on the server: `date` already exists on `CreateAccountTransferDto` and is already
handled by `buildUpdateData`.

## 4. Changing accounts while editing

### API

`UpdateAccountTransferDto` gains `fromAccountId?`, `toAccountId?`, `fromCurrency?`, `toCurrency?`.
Currencies travel with the accounts by necessity — otherwise a transfer edited to
"Personal (PLN) → Vacation (EUR)" keeps its old currency and becomes garbage.

`AccountTransferService.update` gains:

- membership re-validation on both new accounts and a non-viewer check on the new `fromAccountId` —
  the same checks `create` already performs;
- a requirement that the current account remains a party to the transfer, since `findAll` filters on
  `OR: [{ fromAccountId }, { toAccountId }]` and the row would otherwise vanish for both sides;
- moving the linked `Income` to the new `accountId` (and currency) when `countAsIncome` is on and
  `toAccountId` changes. Today the update path only touches that row's amount, notes and date.

### Mobile

`wallet/[id].tsx` renders the same account pickers in edit mode as the create form, and
`walletStore.updateTransfer` forwards the new fields.

## Tests

- `wallet.service.spec.ts` — multi-account aggregation: split-receivable exclusion, `countAsIncome:
  false` on incoming transfers, accounts with no wallet balance rows.
- `account-transfer.service.spec.ts` — account changes: membership, viewer rejection, "current
  account stays a party", linked-income relocation.
- `frequentTransfers.test.ts` — grouping, ranking, dropped accounts.

## i18n

New `transfer.*` keys across all 9 locales: available balance, Max, insufficient-balance hint,
frequent-transfers heading, date label.
