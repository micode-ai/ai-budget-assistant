# Group Trip Wallet

*Hub: [api](../api.md) · related: [receipt-split](receipt-split.md)*

## What this is

A temporary shared account for a travel group, with multi-way expense splitting and a settle-up
flow. `AccountType.trip`, with its own lifecycle: `active → settling → archived`.

## Entry points

- `apps/api/src/modules/expenses/trip-share-calculator.ts` — `resolveShares`
- `apps/api/src/modules/trip-settle-up/settle-up-calculator.ts` — `computeBalances`,
  `simplifyDebts`
- `apps/api/src/modules/trip-settle-up/trip-settle-up.service.ts`
- `apps/mobile/src/stores/tripStore.ts`, `apps/mobile/src/db/tripExpenseShareRepository.ts`
- `apps/mobile/src/components/account/TripSection.tsx`

Migrations: `20260701183505_add_trip_wallet`, `20260702082444_add_trip_settle_up_notification_pref`.

## Key concepts

**Splitting.** `resolveShares` handles all four split types — equal, exact, percentage, shares —
with deterministic rounding: the last participant absorbs the residual cent.

**Settling.** `computeBalances` nets each expense's `paidByUserId` against each share into a
per-person `netAmount`; `simplifyDebts` greedily matches the largest creditor to the largest debtor
to produce the **minimum** set of transfers, not every pairwise debt.

**Payment links.** `revolut.me` / `paypal.me` deep links with the handle and amount
`encodeURIComponent`'d; BLIK gets "pay manually" instructions, because it has no cross-bank deep-link
API.

## Invariants

**Writes are strictly additive for non-trip expenses**, and shares are always fully delete+recreated
on edit, never partially patched.

**`paidByUserId` must be set on BOTH the upsert's `create:` and `update:` branches.** The update
branch was missing once, silently dropping payer edits on the offline-retry path — the same bug
class as `buildLocationColumns`.

**A confirmed payment must reduce the displayed debt, in both fields.** `getBalances` nets confirmed
transactions into the SAME adjusted array used for `balances` and `suggestedTransfers`; deriving
them separately makes the two visibly disagree.

**`pendingTransactions` must be returned.** The **receiver** of a payment never calls `pay`, so
without the server exposing the pending rows they had no way to discover a real transaction id to
confirm from their own device. The original design tracked ids only in local mobile state, which
made the receiver's confirm flow unreachable cross-device.

**Validate the payment against a real suggested transfer before any DB write.** `pay` checks that
`dto.fromUserId === req.user.id` and that the `{fromUserId, toUserId, amount}` triple matches a
`suggestedTransfers` entry within 0.01 — both before writing, which closes a forged-debt-record hole
found in review.

**Use guard-derived `req.accountId` and `req.user.id`, never a raw `:id` param or a client-supplied
identity field.** An early draft's IDOR came from exactly that.

**Confirm is looked up by `{id, accountId}`**, so a foreign-account id 404s before the receiver check
runs — no information gap between "not found" and "not yours".

**Confirm is deliberately NOT `TripArchivedGuard`-blocked.** An owner can force-archive with
unconfirmed debts outstanding, and blocking confirm would strand them.

**The archive transition is owner-only and requires zero pending transactions unless `force: true`.**
Archiving makes the account permanently read-only via `TripArchivedGuard`, stacked alongside
`ViewerBlockGuard`; `accountStore.canEdit()` mirrors it client-side to avoid a doomed
optimistic-write/revert loop.

**Paying is allowed while merely `settling`**, blocked once `archived`.

**The cron uses the central per-type notification gate**, not a per-cron manual check.

**Invites reuse `AccountInvitation` unchanged.** Only the mobile UX differs: a `budget://trip-invite/`
deep link auto-accepted post-registration through the same cold-start gate as the `chat_mention`
push link — and the generic `Linking` handler needs an explicit `trip-invite/` exclusion so it does
not also fire a duplicate, wrong navigation.

**Mount the split picker only when `tripMembers.length > 0`**, and revert a cancelled edit to a
persisted mirror rather than to a blank state. `validateTripSplit()` blocks submit on an invalid
manual split rather than letting it fail server-side.

## Known gaps

- `syncPendingExpenses`'s offline-retry payload drops `shares` / `splitType` / `paidByUserId` on
  resend — a pre-existing pattern shared with `items`, `splits` and `isRecurring`.
- `archiveTrip` and `updatePaymentInfo` patch in-memory state only, relying on the next full server
  reload to persist locally.
- No native iOS/Android Universal or App Links config exists, so the invite is reachable only via the
  custom scheme, not a real tapped `https://` link.

## History

ABA-305 (the feature) · ABA-375 (the four `archiveTrip*` keys backfilled to the eight locales they
had shipped without) · ABA-414 (account-detail screen decomposition).
