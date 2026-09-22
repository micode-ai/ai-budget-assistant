# Account transfers

*Hub: [api](../api.md) · [offline-sync](../offline-sync.md)*

## What this is

Moving money between two accounts the user belongs to, with its own offline write queue — not the
generic `/sync` machinery.

## Entry points

- `apps/api/src/modules/account-transfers/`
- `GET /wallet/summaries` — on `WalletController`, ignores `req.accountId` by design
- `apps/api/src/modules/wallet/wallet-balance.util.ts` — `buildWalletBalanceRow`
- `apps/mobile/src/stores/accountTransferActions.ts` — `syncPendingTransfersAction`
- `apps/mobile/src/features/wallet/transferBalances.ts`, `frequentTransfers.ts`
- `apps/mobile/src/hooks/useTransferForm.ts`, `useTransferEditForm.ts`

## Key concepts

**`GET /wallet/summaries` exists because the transfer form must show the *other* account's
balance**, which `GET /wallet/summary` cannot do. It keeps the class-level `AccountContextGuard` but
enumerates membership from `req.user.id`. It runs the same six aggregates with
`accountId: { in: [...] }` grouped by account + currency, so it stays **six queries regardless of
account count**, and shares `buildWalletBalanceRow` with `getSummary` — a transfer form quoting a
different balance than the wallet screen is worse than no balance.

**Computing other accounts' balances from local SQLite was rejected**: an account the user has never
opened has no local rows, and web has no SQLite at all, so it would silently read too low.

**Currencies travel with the accounts** on edit. Re-homing a transfer while keeping the old currency
stores a meaningless row, so `UpdateAccountTransferDto` carries both, and `update()` moves the
linked `Income` to the new account and currency when `countAsIncome` is on.

## Invariants

**`assertCanTransferBetween` runs on EVERY update and on remove**, not only when the accounts
change. An amount edit moves the other account's balance too, so the rule is: you may edit or delete
a transfer only if you could have created it. The old "skip the two membership lookups when the
accounts are unchanged" optimisation was safe only while the lookup was creator-locked.

**It does NOT require the request's account to remain a party.** That rail used to 403 exactly the
correction the feature exists for — opening a `A → B` transfer from B and saying the money actually
went to C necessarily drops B from both sides. The rail was a display concern, never a permission
rule. Do not re-add it.

**`findAll` and `findOwnedTransfer` are account-scoped, not creator-scoped.** `WalletService`
aggregates transfers by account with no `userId` filter, so a shared account's balance already
counted another member's transfer; filtering the list by `userId` only made the list disagree with
the balance it explains, and left other members unable to see or fix it.

**Resolve the row by id OR `clientId`, then target the resolved id.** The client addresses a row by
its local id until a pull backfills `serverId`; matching on `id` alone 404'd those edits away. Every
`accountTransfer.update` below the lookup targets `transfer.id`, never the raw route param.

**`create` is idempotent on `localId`**, with the pre-check and the P2002 re-fetch both **outside**
the `$transaction`. Without it a retry whose response was lost 500s forever and the row can never
leave the queue.

**Transfers have their own write queue.** `syncPendingTransfersAction` is the counterpart
`sync_status = 'pending'` had been written for and that nothing read for a long time — which is why
a failed transfer write used to be lost outright. It runs from `loadWallet` **before** the server
pull and never throws. A `404` on delete counts as done; a **4xx** marks the row `'error'` (retrying
is pointless, and `'error'` also drops it out of the pull's pending-guard so the server's truth can
overwrite it); a transport failure breaks the loop and leaves the rest queued.

**`loadPendingTransfers` must include soft-deleted rows** — a pending delete has to be pushed — and
is account-scoped, since the push travels under one `X-Account-Id`.

**The pull must skip pending local ids.** `insertTransfer` is `INSERT OR REPLACE`, so without that
guard the pull silently reverts an offline edit.

**Distinguish the two failures on edit.** `TransferWriteResult` is `saved | queued | rejected`: a
transport failure keeps the edit applied and pending, and only a 4xx rolls back in memory **and** in
SQLite. A refused edit would otherwise look saved and quietly revert on the next pull. The screen
stays in edit mode on `rejected` only.

**Re-home the linked income locally when the destination changes.** The money rides on that income,
so without `moveIncomeAccountInDb` the amount keeps counting toward the **old** account's balance
until both accounts happen to pull. The local row is keyed `transfer-income-{clientId}`, not the
server income id.

**Show an unknown balance as an em dash, never a fabricated zero.** The current account resolves
from the exact, offline-capable local summary first; others from the server map.

**The over-balance warning never blocks submit.** A tracker records transfers after the fact, and an
account whose initial balance was never set looks emptier than it is.

## Known gaps

- No creator attribution on the list now that members see each other's rows; expenses cache
  `createdByUserName`, transfers have no equivalent.
- The queue is pumped only by `loadWallet`, so there is no connectivity listener — a queued write
  waits for the next visit to a wallet screen.
- Other accounts' balances need network on first use.
- Clearing a transfer's note does not work in either direction: `notes: undefined` is dropped by
  `updateTransferInDb` and by JSON serialisation.

## History

ABA-388 (the feature and `GET /wallet/summaries`) · ABA-469 (create-form decomposition) · ABA-472
(the party rail removed) · ABA-473 (idempotent create, account-scoped reads, the write queue wired
up at last) · ABA-479 (detail-screen decomposition).
