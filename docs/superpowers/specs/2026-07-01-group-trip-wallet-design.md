# Group Trip Wallet — Design Spec

**Date:** 2026-07-01
**Status:** Draft (pending user review)

## Overview

A new temporary shared-account type for travel groups (friends, couples, families on a trip). Members log expenses in any currency, each expense is split between selected trip members (equal / exact / percentage / shares), and at any point — or automatically once the trip ends — the app computes a minimal set of "who owes whom" transfers and helps settle them via payment-app deep links.

## Goals

- **Virality / new-user acquisition**: a temporary group (friends going on a trip) is a much lower bar to "install an app" than joining a permanent family account. Every invited trip member becomes an installed, registered user.
- **Differentiation**: no competitor in this app's niche (household budget + AI chat + bots) has trip-style multi-party expense splitting.
- **Reuses existing infrastructure**: accounts, invitations, expenses, currency exchange — no separate "mini app".
- Explicitly **out of scope for this spec**: Pro-tier gating/limits on trip creation (deferred — a limit would hurt the very virality this feature exists for; revisit once usage data exists).

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Guest access | Full registration required (quick Google/email) | Every invitee becomes a real, retainable user — this *is* the viral loop |
| Data model | New `AccountType.trip` (not a flag on `shared`) | Keeps trip-only UI/lifecycle logic isolated; zero risk to existing shared-account behavior |
| Settle-up module | Built as a standalone reusable block (`SettleUpTransaction`, not tied to `type='trip'`) | Future "Household Settle-Up" for regular shared accounts can reuse it without schema changes |
| Split types | Equal, exact amounts, percentages, shares (full set) | Matches user expectation set by Splitwise-class apps; a "equal only" MVP would feel broken for real trip use cases (e.g. one person skips a round) |
| Payer field | New `Expense.paidByUserId` (separate from `Expense.userId` creator/attribution) | Someone often logs an expense after the fact for a purchase someone else made |
| Debt currency | Computed in `Account.currencyCode` (trip currency); displayed to each viewer converted to their own `user.currencyCode` client-side | Reuses the existing `convertAmount` pattern everywhere else in the app; no new server-side per-user conversion logic |
| Payment settlement | Deep-links to Revolut/PayPal (URL schemes that support prefilled amount); BLIK has no cross-bank deep-link — shown as phone number + manual instruction; always requires manual "confirm" by the receiver | No PSP integration (Stripe Connect / KYC) — out of scope, high regulatory/engineering cost for MVP |
| Invite flow | Reuses existing `AccountInvitation` model + `acceptInvitation()` service method; only the **mobile UX** changes (auto-accept right after registration, no manual code-entry screen) | Avoids a second invite system; `inviteCode`/`expiresAt`/role logic already exists and works |
| Trip end lifecycle | `active` → `settling` (auto, via cron) → `archived` (manual, read-only forever) | Users need an explicit nudge but shouldn't lose access to trip history |
| Tier gating | None in this spec | A free-tier limit at launch would suppress the exact viral behavior this feature is meant to create |

## Data Model

### Migration: `add_trip_wallet`

```prisma
enum AccountType {
  personal
  business
  shared
  investment
  trip          // NEW
}

enum TripStatus {
  active
  settling
  archived
}

enum ShareType {
  equal
  exact
  percentage
  shares
}

enum SettleMethod {
  blik
  revolut
  paypal
  cash
  other
}

enum SettleStatus {
  pending
  confirmed
}

model Account {
  // ...existing fields...
  tripStartDate DateTime?   @db.Date
  tripEndDate   DateTime?   @db.Date
  tripStatus    TripStatus?
  settleUpTransactions SettleUpTransaction[]
}

model AccountMember {
  // ...existing fields...
  paymentMethod SettleMethod?
  paymentHandle String?       // Revolut username / paypal.me slug / phone for BLIK
}

model Expense {
  // ...existing fields...
  paidByUserId String?        // trip accounts only; null elsewhere. Defaults to creator (userId) at insert time, editable after.
  shares       TripExpenseShare[]
}

model TripExpenseShare {
  id          String    @id @default(uuid())
  expenseId   String
  expense     Expense   @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  shareType   ShareType
  shareAmount Decimal   @db.Decimal(12, 2)  // always denormalized to an exact amount at write time, regardless of shareType
  createdAt   DateTime  @default(now())

  @@unique([expenseId, userId])
  @@index([userId])
  @@map("trip_expense_shares")
}

model SettleUpTransaction {
  id          String        @id @default(uuid())
  accountId   String
  account     Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  fromUserId  String        // debtor
  toUserId    String        // creditor
  amount      Decimal       @db.Decimal(12, 2)  // in Account.currencyCode
  method      SettleMethod?
  status      SettleStatus  @default(pending)
  confirmedAt DateTime?
  createdAt   DateTime      @default(now())

  @@index([accountId])
  @@map("settle_up_transactions")
}
```

`Expense.paidByUserId` is populated only for `type='trip'` accounts; `null` elsewhere (no migration/backfill needed for existing rows). `TripExpenseShare`/`SettleUpTransaction` are new tables — no changes to `Expense`'s existing columns beyond adding the one nullable field.

## Trip Lifecycle

```
active  --(tripEndDate < today, daily cron)-->  settling  --(owner action, manual)-->  archived
```

- **`active`**: behaves like a normal shared account — full CRUD for editors/owner, `AccountRoleGuard`/`ViewerBlockGuard` apply as usual.
- **`settling`**: new `TripSettleUpReminderCron` (`0 9 * * *`, same pattern as `debt-reminder.cron.ts`) finds `trip` accounts where `tripEndDate < today && tripStatus = 'active'`, flips status, sends a `trip_settle_up` push to every member (gated by new `user.notifyTripSettleUp`, default `true`). Writes are still allowed (expenses can still be corrected) — only the *badge/banner* changes.
- **`archived`**: triggered manually by the owner via "Завершить поездку" button, available once all `SettleUpTransaction` rows for the account are `confirmed` (or via a "Завершить всё равно" force option). New `TripArchivedGuard` blocks **all** mutation endpoints for this account — including the owner (unlike `ViewerBlockGuard`, which only blocks the `viewer` role). Read (`GET`) endpoints remain open forever — trips are a "trip memory book", not deleted.

Archived trips move out of `AccountSwitcher`'s main list into a "Прошлые поездки" (Past trips) section, opened in read-only mode.

## Invite Flow

Reuses the existing `AccountInvitation` model and `AccountsService.acceptInvitation()` — no new invite table.

1. Organizer taps "Пригласить" in a trip account → `POST /accounts/:id/invitations` (existing endpoint) → gets back `inviteCode`.
2. Shared as a deep-link `https://ai-budget.pl/trip-invite/<code>` + QR (existing share-sheet pattern from `account/invite.tsx`).
3. Invitee opens the link:
   - App not installed → store landing page (standard deferred-deep-link pattern).
   - App installed, not logged in → quick registration screen (Google or email, existing `(auth)/register.tsx`), `inviteCode` carried through as a route param.
   - **New behavior**: immediately after successful registration/login, if an `inviteCode` param is present, the client calls `POST /accounts/invitations/accept` automatically — the existing manual "enter code" screen (`account/join.tsx`) is skipped entirely for this flow (it remains as-is for the existing manual invite path).
4. New member lands directly in the trip account, default role `editor` (existing default — can add/split expenses, cannot manage trip settings unless promoted).

## Expense Splitting

New component `TripExpenseSplitPicker` (mobile), shown only when `currentAccountType === 'trip'`, added to `expense/new.tsx` and `expense/[id].tsx` — **separate** from the existing `SplitEditor` (which splits one expense across *categories*, unrelated concept, confirmed via codebase check).

- Checkboxes for trip members, all checked by default.
- Split-type toggle: **Поровну** (equal) / **Точные суммы** (exact) / **Проценты** (percentage) / **Доли** (shares, e.g. "2 доли" for a couple vs "1 доля" for a single traveler).
- Client-side validation mirrors `SplitEditor.handleConfirm`: sum of shares must equal `expense.amount` (with rounding-remainder assigned to the last participant, standard practice).
- Submitted as part of the existing `CreateExpenseDto`/`UpdateExpenseDto` call: `shares?: { userId: string; shareType: ShareType; value: number }[]`. `ExpensesService.create`/`update` denormalizes `value` into `shareAmount` and writes `TripExpenseShare` rows inside the same transaction — no new endpoint.
- `paidByUserId` defaults to the expense creator, shown as an editable "Кто заплатил" picker (defaults hidden/collapsed unless the user taps to change it).

## Settle-Up Calculation

`GET /accounts/:id/settle-up` (new module `modules/trip-settle-up/`, guards: `JwtAuthGuard + AccountContextGuard`, any member role):

```
for each expense in the account:
  net[expense.paidByUserId] += amount (converted to Account.currencyCode via ExchangeRateService)
  for each TripExpenseShare of that expense:
    net[share.userId] -= share.shareAmount (converted to Account.currencyCode)
```

Then a standard greedy debt-simplification pass (repeatedly match the largest creditor with the largest debtor) produces the **minimum number of transfers** rather than exposing every pairwise debt.

Response:

```typescript
interface SettleUpResponse {
  balances: { userId: string; userName: string; netAmount: number }[]  // in Account.currencyCode
  suggestedTransfers: { fromUserId: string; toUserId: string; amount: number }[]  // in Account.currencyCode
  currencyCode: Currency
  fxApproximate: boolean  // same flag pattern as ai-tools.service.ts
}
```

**Per-viewer currency display**: the mobile client converts every amount to `user.currencyCode` using the existing `convertAmount`/`exchangeRateStore` — no new server-side per-user conversion. Two members can therefore see the same debt as different numbers in their own currencies (this was an explicit, confirmed choice).

### Paying a debt

`POST /accounts/:id/settle-up/pay` — body `{ fromUserId, toUserId, amount }` (must match a `suggestedTransfers` entry) → creates a `SettleUpTransaction` (`status: pending`) and returns a payment link:

| Creditor's `paymentMethod` | Link |
|---|---|
| `revolut` | `https://revolut.me/<paymentHandle>?amount=<amt>&currency=<CUR>` |
| `paypal` | `https://paypal.me/<paymentHandle>/<amt><CUR>` |
| `blik` | No cross-bank deep-link exists — response includes `paymentHandle` (phone) and a `manualInstructions` flag; UI shows "Send a BLIK transfer manually to +48 XXX XXX XXX" |
| `cash` / `other` / unset | No link — just the amount, to be settled outside the app |

`PATCH /accounts/:id/settle-up/:id/confirm` — receiver-only, sets `status: confirmed, confirmedAt`. The app never verifies the money actually moved — this is an honor-system confirmation, same trust model as marking a manual debt repaid elsewhere in the app (`debts` module).

## API Endpoints Summary

Module: `apps/api/src/modules/trip-settle-up/` (new) + extensions to `apps/api/src/modules/accounts/` (new `AccountType`, `TripArchivedGuard`) and `apps/api/src/modules/expenses/` (`paidByUserId` + `shares` handling).

| Method | Path | Guard | Description |
|---|---|---|---|
| `POST` | `/accounts` (existing, extended) | `JwtAuthGuard` | `type: 'trip'` + `tripStartDate?`, `tripEndDate` (required for trip type) |
| `PATCH` | `/accounts/:id/archive-trip` | Owner-only, requires all settle-ups confirmed (or `force: true`) | Sets `tripStatus: 'archived'` |
| `GET` | `/accounts/:id/settle-up` | `JwtAuthGuard + AccountContextGuard` | Balances + suggested transfers |
| `POST` | `/accounts/:id/settle-up/pay` | `JwtAuthGuard + AccountContextGuard`, `TripArchivedGuard` bypass not needed (paying is allowed while `settling`) | Creates `SettleUpTransaction`, returns payment link |
| `PATCH` | `/accounts/:id/settle-up/:id/confirm` | `JwtAuthGuard + AccountContextGuard`, receiver only | Confirms payment |
| `PATCH` | `/account-members/:id/payment-info` | `JwtAuthGuard + AccountContextGuard` | Sets own `paymentMethod`/`paymentHandle` |

`AccountsService.create()` validates: `type === 'trip'` requires `tripEndDate`; `tripStartDate` defaults to today if omitted.

## Shared Types

### `packages/shared-types/src/entities/index.ts`

```typescript
type AccountType = 'personal' | 'business' | 'shared' | 'investment' | 'trip'
type TripStatus = 'active' | 'settling' | 'archived'
type ShareType = 'equal' | 'exact' | 'percentage' | 'shares'
type SettleMethod = 'blik' | 'revolut' | 'paypal' | 'cash' | 'other'
type SettleStatus = 'pending' | 'confirmed'

interface TripExpenseShare {
  id: string
  expenseId: string
  userId: string
  shareType: ShareType
  shareAmount: number
  createdAt: string
}

interface SettleUpTransaction {
  id: string
  accountId: string
  fromUserId: string
  toUserId: string
  amount: number
  method: SettleMethod | null
  status: SettleStatus
  confirmedAt: string | null
  createdAt: string
}
```

### `packages/shared-types/src/dto/index.ts`

```typescript
interface ExpenseShareDto { userId: string; shareType: ShareType; value: number }
// CreateExpenseDto / UpdateExpenseDto += shares?: ExpenseShareDto[]; paidByUserId?: string

interface SettleUpResponse {
  balances: { userId: string; userName: string; netAmount: number }[]
  suggestedTransfers: { fromUserId: string; toUserId: string; amount: number }[]
  currencyCode: Currency
  fxApproximate: boolean
}

interface SettleUpPayDto { fromUserId: string; toUserId: string; amount: number }

interface AccountMemberPaymentInfoDto { paymentMethod: SettleMethod; paymentHandle: string }
```

## Mobile

### New files

| File | Description |
|---|---|
| `apps/mobile/app/trip/new.tsx` | Create trip screen (name, start/end date, currency) |
| `apps/mobile/app/trip/[id]/settle-up.tsx` | Balances + suggested transfers + pay/confirm buttons |
| `apps/mobile/app/trip/payment-settings.tsx` | Set own Revolut/PayPal/phone handle |
| `apps/mobile/src/components/expenses/TripExpenseSplitPicker.tsx` | Split-type UI, used inside `expense/new.tsx`/`[id].tsx` |
| `apps/mobile/src/stores/tripStore.ts` | Settle-up state (balances, suggested transfers), server-only |
| `apps/mobile/src/services/trip.api.ts` | API client for trip-settle-up endpoints |

### `tripStore.ts`

```typescript
interface TripStore {
  balances: SettleUpBalance[]
  suggestedTransfers: SuggestedTransfer[]
  isLoading: boolean

  loadSettleUp: (accountId: string) => Promise<void>
  payDebt: (accountId: string, fromUserId: string, toUserId: string, amount: number) => Promise<{ paymentLink: string | null; manualInstructions: boolean }>
  confirmPayment: (accountId: string, transactionId: string) => Promise<void>  // optimistic
}
```

Not offline-first (same rationale as `purchaseRequestStore`/`familyFeedStore` — settle-up requires cross-member consistency).

### `AccountSwitcher` changes

- Trip accounts render with a suitcase icon and a status badge: `active` → "N дней осталось" (computed from `tripEndDate`); `settling` → "Поездка окончена — рассчитайтесь" (tap → `trip/[id]/settle-up.tsx`).
- Archived trips move to a new collapsible "Прошлые поездки" section at the bottom of the account list, opened read-only (all write affordances hidden, same `canEdit`-style gating used elsewhere, but driven by `tripStatus === 'archived'` instead of role).

### Expense screens

`expense/new.tsx`/`[id].tsx`: when `currentAccountType === 'trip'`, render `TripExpenseSplitPicker` below the amount field, and a "Кто заплатил" chip row (defaults to the creator, collapsed unless tapped).

### i18n

~20 new keys under `trip.*` in all 9 locales, e.g.:
```
createTrip, tripName, startDate, endDate, daysLeft, tripEnded, settleUp,
splitEqually, splitExact, splitPercentage, splitShares, paidBy,
youOwe, owesYou, allSettled, payVia, markAsPaid, confirmReceived,
pastTrips, archiveTrip, archiveTripConfirm, addPaymentInfo
```

## Notifications

New `NotificationType`: `trip_settle_up` (sent by the cron when a trip transitions to `settling`). New preference `user.notifyTripSettleUp` (default `true`), added to `GET/PATCH /users/me/notification-preferences` and `app/settings/notifications.tsx`.

## Testing

### `trip-settle-up.service.spec.ts`

- Balance calculation: single payer + equal split among 3 → correct net balances
- Debt simplification: 3-person cycle (A owes B, B owes C, C owes A different amounts) → minimal transfer count, no self-transfers
- Multi-currency expenses within one trip → all converted to `Account.currencyCode` before netting
- `paidByUserId` defaults to creator when omitted; editable after
- Rounding: split with a remainder cent assigns it deterministically (last participant)

### `trip-settle-up.controller.spec.ts`

- `GET /settle-up` scoped to account membership only
- `POST /settle-up/pay` rejects an amount that doesn't match any `suggestedTransfers` entry
- `PATCH /settle-up/:id/confirm` — only the `toUserId` can confirm, others get 403

### `accounts.service.spec.ts` (extended)

- `create({ type: 'trip' })` without `tripEndDate` throws
- `TripArchivedGuard` blocks a write from the owner on an archived trip

## Edge Cases

| Case | Handling |
|---|---|
| Trip member leaves before settling | Existing `AccountMember` leave flow blocked while `netAmount !== 0` for that user (mirrors a "you have unsettled balances" guard) |
| Expense edited after split submitted | `TripExpenseShare` rows are replaced (delete + recreate) in the same transaction as the expense update |
| Currency has no FX rate available | Same `fxApproximate: true` fallback pattern as `ai-tools.service.ts` — native amounts used, UI shows an "approximate" note |
| Owner archives with unconfirmed debts (`force: true`) | Allowed; unconfirmed `SettleUpTransaction` rows remain visible in the read-only archive as a permanent record |
| Payment link requested but no `paymentMethod` set for creditor | Returns `paymentLink: null`, UI falls back to "Отметить как оплачено" only |
| Trip account viewed by a non-member | Standard `AccountContextGuard` 403 — no special-casing needed |

## Out of Scope (this spec)

- Pro-tier limits on trip count/member count (deferred per explicit decision above)
- Real payment processing / Stripe Connect / escrow
- BLIK cross-bank deep-linking (does not exist as a public API)
- Anonymous/guest (non-registered) trip participation
- Converting an existing `shared` account into a `trip` account or vice versa
- Item-level receipt splitting (who ordered what on a restaurant bill) — only whole-expense splitting in v1
