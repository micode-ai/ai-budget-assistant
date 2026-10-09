# Shared expense groups

*Hub: [api](../api.md) · related: [receipt-split](receipt-split.md),
[trip-wallet](trip-wallet.md), [acquisition-tracking](acquisition-tracking.md)*

## What this is

Ongoing groups (a flat, a trip, shared groceries) that an app user creates and that friends
**without an account** use from a browser link: who paid, running balances, "who pays whom", the
history, adding an expense and settling in one tap. It replaces Splitwise for people leaving its
free tier, and every group puts several non-users in front of the product. Free on every tier;
abuse is bounded by hard caps and write ceilings, not a paywall.

## Entry points

API (`apps/api/src/modules/groups/`):
- `apps/api/src/modules/groups/groups.controller.ts` — the authenticated app routes under `/groups`
- `apps/api/src/modules/groups/groups.service.ts` — every ledger write, the caps, link-code
  redemption, the `group_activity` push
- `apps/api/src/modules/groups/group-guest.controller.ts` — the public `/g/:token` surface
- `apps/api/src/modules/groups/group-guest.service.ts` — cookie identity, CSRF, origin check,
  write ceilings; delegates ledger writes to `GroupsService`, never re-implements them
- `apps/api/src/modules/groups/group-ledger.ts` — pure math, no DI
- `apps/api/src/modules/groups/group-fx.ts` — pure write-time currency conversion and the edit rule (ABA-654)
- `apps/api/src/modules/groups/group-items.ts` and `apps/api/src/modules/groups/group-items.service.ts` — line
  items and claims on an itemised expense: the claims-to-shares mapper over receipt-split's calculator, the
  lock rule, the claim routes and the guest claim form's data (ABA-655)
- `apps/api/src/modules/groups/group-reminder.cron.ts` and `apps/api/src/modules/groups/group-reminder.ts`
  — the daily balance reminder cron and its pure episode state machine (ABA-653)
- `apps/api/src/modules/groups/group-ownership.service.ts` — ownership transfer, succession on an
  account departure, orphan adoption, the "Former member" rename (ABA-650)
- `apps/api/src/modules/groups/group-merge.ts` and `apps/api/src/modules/groups/group-merge.service.ts` — merging
  two members: the pure consent rule, plan and balance check, and the one transaction that applies them (ABA-657)
- `apps/api/src/modules/groups/helpers/group-guest-page.ts` and
  `apps/api/src/modules/groups/helpers/group-guest-page-i18n.ts` — the script-free HTML page, 9 locales
- `apps/api/src/modules/groups/guards/` — `GroupMemberGuard`, `GroupOwnerGuard`, `GroupActiveGuard`
- `apps/api/src/modules/groups/group-bot.service.ts` and `apps/api/src/modules/groups/group-bot.ts` — adding
  an expense from Telegram, WhatsApp and Slack (ABA-658); the bots' `handlers/group.handler.ts` render it

Shared types: `packages/shared-types/src/entities/group.ts`, `packages/shared-types/src/dto/group.ts`.

Mobile:
- `apps/mobile/app/groups/` — `index`, `new`, `join`, `link`, and `[id]/` (`index`, `expense`,
  `settle`, `members`, `claims`)
- `apps/mobile/src/components/groups/` — the screen bodies
- `apps/mobile/src/stores/groupStore.ts`, `apps/mobile/src/services/groups.api.ts` — in-memory,
  server-only; reset on sign-out from `apps/mobile/src/stores/authSessionActions.ts`
- `apps/mobile/src/features/groups/` — pure helpers (split validation, display, pay links, link codes,
  `groupFx.ts` for the currency chip and the two-figure rows, `groupItems.ts` for the line editor, the
  claim window and the "your part" preview)
- `apps/mobile/src/components/groups/GroupClaimsView.tsx`, `apps/mobile/src/components/groups/GroupItemsEditor.tsx`,
  `apps/mobile/src/hooks/useGroupExpenseItems.ts` — itemised expenses and claims (ABA-656)
- `apps/mobile/src/hooks/useGroupLinkDeepLink.ts` — a link code stashed while signed out
- `apps/mobile/src/features/groups/groupMerge.ts` — who the member sheet offers a merge with, the confirm's
  preview, the link-code merge offer (ABA-657)
- Entry: the `groups` quick action (`apps/mobile/src/stores/quickActionStore.ts`); the activity push opens
  `/groups/:id`, the balance reminder `/groups/:id/settle` (`apps/mobile/src/services/notifications.ts`
  through `apps/mobile/src/features/groups/groupPush.ts`)

Migrations: `20261009000000_add_expense_groups`, `20261012000000_group_member_join_provenance`,
`20261013000000_group_ownership_transfer`, `20261014000000_group_balance_reminders`,
`20261015000000_group_expense_fx`, `20261016000000_group_expense_items`,
`20261017000000_group_member_merge`. Design:
[`docs/superpowers/specs/2026-10-08-shared-groups-design.md`](../../superpowers/specs/2026-10-08-shared-groups-design.md)
— where it and the code differ, the code is right (the spec's `GET /g/:token/me/:secret` restore
link and `Restrict` member FKs were both replaced in the security hardening).

## Key concepts

**A standalone model, not an `AccountType`.** `ExpenseGroup`, `ExpenseGroupMember`,
`GroupExpense`, `GroupExpenseShare`, `GroupSettlement`. A member is a row, never a `User`:
`userId` is nullable and NULL means a guest. Every payer, share and settlement references a
**member id**. An `AccountType.group` (or a trip variant) fails because `AccountMember.userId`,
`Expense.userId`, `TripExpenseShare.userId` and the settle-up user columns are all non-null FKs to
`User` — a guest could not pay, owe or be paid — and an `Account` drags in categories, budgets,
wallet, `/sync`, analytics, the AI `UserContext`, anomaly detection and gamification, each of which
would need a "but not for groups" branch. Groups are therefore **not account-scoped**:
`AccountContextGuard` and `ViewerBlockGuard` do not run (the mobile client still sends
`X-Account-Id`; it is ignored). `GroupMemberGuard` replaces them: it resolves the caller's live
member row and answers **404, not 403**, to a non-member.

**Ledger math reuses the trip calculators, not their persistence.** `group-ledger.ts` passes the
member id as the calculators' opaque `userId`:
- shares: `resolveShares` from `apps/api/src/modules/expenses/trip-share-calculator.ts` (equal,
  exact, percentage, shares; the last member absorbs the residual cent). The guest form offers
  equal and exact only.
- balances: `computeBalances` from `apps/api/src/modules/trip-settle-up/settle-up-calculator.ts`,
  fed with each live expense and each **non-voided settlement as a synthetic entry** (debtor
  "paid", creditor "consumed" the same amount), so a settlement nets into the same array that
  produces the suggested transfers. Every live member is padded in at 0.
- transfers: `simplifyDebts` as is — a greedy plan of at most n−1 transfers that evens everything
  out. It is not guaranteed globally optimal, and nothing (UI copy included) may promise that.

**Settling.** The acting member must be the payment's `from` or `to`. Since **ABA-652** the amount
is checked against the **current balances**, not the suggested transfers: `validateSettlement` in
`group-ledger.ts` accepts it when `from` owes (net ≤ −0.005), `to` is owed (net ≥ 0.005) and
`0.01 ≤ amount ≤ min(−net[from], net[to]) + 0.01`, and the row is **stored clamped** to
`min(−net[from], net[to])` (`maxSettlementAmount`), so the cent of tolerance can never flip a sign.
So a payment may be partial, or go to a creditor who is not the suggested one, but it only ever
shrinks both balances toward zero. Every suggested transfer passes (`simplifyDebts` never exceeds
either side). A refusal is 400 `SETTLEMENT_EXCEEDS_BALANCE` with a `reason` (`not_debtor`,
`not_creditor`, `exceeds_balance`, ...); the app also still treats the old `SETTLEMENT_MISMATCH` as
the same thing. The order is: `clientRequestId` replay (a no-op, before any check), from ≠ to, the
acting-member rule, re-scoped live members, the version check (409 `LEDGER_CHANGED`), the balance
rule, all **before any write**; then one `$transaction` does a compare-and-swap on
`ExpenseGroup.ledgerVersion` and creates the settlement, or fails with 409 `LEDGER_CHANGED`. Every ledger write (expense create/edit/delete, settle, void)
bumps `ledgerVersion` in its own transaction. A payment **counts immediately** — no pending state,
because guests visit sporadically and a "waiting for the creditor" state would leave balances stale
in the common case. A wrong one is **voided** (recorder, receiver or owner in the app; recorder or
receiver on the guest page) and stays in the history.

**Money never reaches the user's own budget.** The ledger writes no `Expense` or `Income` row, so
analytics, budgets, safe-to-spend, wallet, the AI context, anomaly and gamification never see group
money and no `isSplitReceivable`/`isDebt` filter is involved. "Your share this month" on the group
screen is display-only. The cost: when the user's own card payment for a group expense is also
captured (notification, import, receipt), their budget shows the full outflow, not their share.

**`Income.isSplitReceivable` exists, and nothing sets it yet (ABA-659, phase-2 task H1).** The
budget mirror (H2) will link a captured incoming settlement transfer to the group and exclude it,
so the income side needed the marker the expense side already had. It is a server-owned column
(`NOT NULL DEFAULT false`, migration `20261018000000_income_split_receivable`) that rides the
existing income pull (never pushed), with a mobile SQLite column and `rowToIncome` mapping; the
same `EXCLUDE_SPLIT_RECEIVABLE` object is spread into every income total — analytics summary,
aggregated summary and project totals, wallet summary, all-accounts summaries, daily and monthly
balance history, safe-to-spend's income inference, both Wrapped decks, the spending story, real
salary, the monthly digest, the weekly and monthly report e-mails, gamification's net-positive
month and the goal planner's average income — and on the device `filterIncomeConsumption()` into
`computeIncomeTotalsByCurrency`, the wallet totals (SQL and the web store path), the analytics,
calendar, scenario, net-profit and safe-to-spend hooks, the expenses-tab header total, the desktop
ledger's earned total and `localAnalytics`. Behaviour-neutral on its own: every row is `false`, and
`income-split-receivable.spec.ts` runs each server total with and without a flagged income and
requires a deep-equal result. Deliberately NOT filtered: income listings and the report export
(rows the user recorded are shown), row counts (admin metrics, the `first_income` achievement,
category usage), debt repayment lookups and import dedup. Expense-side gaps the H2 linker will
meet: the digest, scheduled report e-mails, gamification, story, goal planner and the report export
sum expenses WITHOUT `EXCLUDE_SPLIT_RECEIVABLE` today, so a linked cash-leg expense would still
count there (pre-existing for receipt splits; left alone here because fixing it changes figures).

**The guest surface (`GroupGuestController`, `@Controller('g')`).** A sibling of
`GuestController` (`s/`) and `ShoppingListGuestController` (`sl/`), excluded from `/api/v1` by the
`'g/(.*)'` wildcard in `apps/api/src/global-prefix-exclusions.ts`. Server-rendered HTML with no
`<script>`, plain forms, Post/Redirect/Get (every POST answers 303 to `/g/:token`), and headers
`no-store`, `noindex`, `Referrer-Policy: same-origin`, `nosniff` and a strict CSP (`default-src 'none'`,
`form-action` limited to self plus the two link-handoff destinations, `frame-ancestors 'none'`).
Security model:
- **Token.** `guestToken` is 128-bit random, the group's bearer credential, stored plain because
  members re-share it. `findGroup` reads scalar columns only. An unknown token, `guestAccess = false`
  and a deleted group all render the **byte-identical** not-found page. An archived group renders
  read-only.
- **Identity.** The acting member comes from the `abg_m` cookie and **never from a form field**.
  The cookie holds a random device secret; the database holds only its sha256 (`claimTokenHash`).
  It is `HttpOnly; Secure; SameSite=Lax`, 400 days, and **path-scoped** to `/g/<token>`, so a guest
  in two groups holds two independent cookies. Joining either claims an unclaimed placeholder
  (atomic `updateMany ... claimTokenHash: null`, the race loser gets "name taken") or creates a new
  guest member.
- **CSRF.** Every cookie-authenticated form carries `csrf = sha256('grp-csrf:' + secret)`,
  compared with `timingSafeEqual`. The two cookie-minting POSTs (join, restore) cannot carry it, so
  `isTrustedRequestOrigin` lets the browser decide through `Sec-Fetch-Site` (only `same-origin`
  passes); only when that header is absent does it fall back to `Origin` (absent, our own origin or
  the request's host pass; `null` fails). They also never replace a cookie that already resolves to
  a live member (login CSRF / session fixation). **Never make this Origin-first and never set the
  page to `no-referrer`:** with `no-referrer` a browser sends `Origin: null` on its own same-origin
  form POST, and that refused every real join with "You can't do that" on the first day in
  production (2026-10-09). The page uses `Referrer-Policy: same-origin`, which still never leaks the
  tokened URL to an external site.
- **Write ceilings.** After the actor and CSRF checks pass, a write charges a per-member hourly
  bucket (`grp:w:{groupId}:{memberId}`) and then the per-group one (`grp:w:{groupId}`); joins have
  their own per-group bucket (`grp:j:{groupId}`). They go through `CacheService.incrementWindow`,
  which throws on a Redis outage, and the guest write then **fails closed** with a "try again later"
  page. Per-IP `ThrottlerGuard` limits sit on every route as well.
- **Restore code.** Shown once, on the render right after joining. On another device it is typed
  into a form and arrives as `POST /g/:token/restore` **in the body, never in a URL**, so it stays
  out of access logs, history and Sentry. "Not me / forget this device" clears the cookie and the
  claim.
- **Rotation.** `POST /groups/:id/rotate-link` mints a new token **and clears every
  `claimTokenHash`** in the same transaction: the old cookies are orphaned by their path anyway,
  and everyone re-picks their name. It is the "the link leaked" remedy.
- **Settle form (ABA-652).** Each transfer row the viewer is part of carries a visible text `amount`
field (`inputmode="decimal"`, comma accepted by `parseAmount`) prefilled with the suggested amount,
and a hint with the pair's bound (`GuestTransferView.maxAmount`). Still no script, still the CSRF
field, the `rid` and `v`. The server re-validates exactly as for the app; a refusal is the flash
`toomuch`. The guest page offers no "pay someone else" picker: a guest settles only along a
suggested row, at any amount up to its bound.

**What the page may show.** Display names, descriptions, amounts, dates, and a creditor's
  payment handle only on the transfer row where the viewer pays that creditor. Never a `userId`,
  email, `accountId`, or whether a member is an app user. A guest deletes only expenses they
  created; a foreign id in a form is a silent no-op.

**Guest → user linking.** A cookie-identified guest taps "Open in the app" / "Continue in the
browser app": `POST /g/:token/link` mints a single-use code in Redis (`grp:link:{code}`, 10 min)
bound to `{groupId, memberId, guestToken, claim}` and 303s to a **constant** base (web
`app.ai-budget.pl/groups/link?code=…&src=group&loc=guest_link`, or `budget://groups/link` on an
Android user agent) — only the code is appended, so there is no open redirect. The code is read
back after writing, because `CacheService.set` swallows Redis errors. `POST /groups/link-guest`
redeems it with an atomic GETDEL, re-reads the group and refuses (410 `LINK_CODE_INVALID`) when
the token has rotated since, guest access is off or the group is archived, and when the member's
claim is no longer the one the code was minted under (`claim` is `linkClaimBinding(claimTokenHash)`,
a one-way digest; an owner reset, "forget this device" or a re-claim by another browser changes or
clears the hash, ABA-651); the bind is a CAS on that hash as well. 409 `ALREADY_MEMBER`
when the caller is already in the group. Success sets `userId` on the member row — history and
balances carry over with no re-pointing — and clears the claim, so the browser cookie stops acting
as that member.

**Push.** `group_activity` with data `{groupId}`, fire-and-forget through `logFireAndForget`, to
app-user members other than the actor, gated by `User.notifyGroupActivity` (the toggle in
notification settings), and coalesced per recipient per group for 10 minutes through
`CacheService.setIfAbsent('grp:push:{groupId}:{userId}')`. Sent on expense create/edit and settle.

**Balance reminders (ABA-653).** `GroupReminderCron` (`apps/api/src/modules/groups/group-reminder.cron.ts`,
`@Cron('0 17 * * *')`, 17:00 UTC daily) over the pure state machine in
`apps/api/src/modules/groups/group-reminder.ts`. It streams active groups that have a live app-user
member through `paginateById`, calls `GroupsService.loadState` per group, and keeps an **episode**
on each app-user member row: `balanceOpenSince`, `balanceOpenSign` (-1 owes, 1 is owed),
`lastReminderAt`, `reminderCount`. `nextReminderState(prev, net, now)`:
- |net| < 1.00 (`REMINDER_MIN_BALANCE`) closes the episode and resets all four columns, so a settled
  balance starts the count again;
- a first sight of an open balance, or a sign flip, opens a new episode (clock = today, no push);
- inside an episode a reminder is due 7 whole UTC days after the episode opened, then 7 days after
  the previous one, at most 4 (`REMINDER_MAX_PER_EPISODE`), never twice on one UTC day.
Columns are written only when they change. Of everything due, each user gets **one** push per day,
for the group with the largest |balance| (`pickPerUser`, tie on the lower group id); the rest stay due
and go out on later days. A user any of whose rows was reminded today is skipped (re-runs), and the
send is claimed by a compare-and-swap `updateMany` on that row's `reminderCount`, `lastReminderAt` and
`balanceOpenSign`, so a second run or instance sends nothing: the member row is the dedup ledger
(the account-scoped `NotificationDedupLedger` tables do not fit a model with no `accountId`).
Recipients are filtered to `isActive`, a push token and `notifyGroupReminders` BEFORE the claim, so an
opted-out user does not spend a reminder; `NotificationsService` gates the `group_reminder` type again
in both `sendToUser` and `sendToUsers`. Debtors get "you owe" with data
`{groupId, reminder: 'owe', fromMemberId, toMemberId}` (their largest suggested transfer); creditors
get "you are owed" with `{groupId, reminder: 'owed'}`. The app's `groupPushRoute`
(`apps/mobile/src/features/groups/groupPush.ts`) opens `/groups/:id/settle` with the pair (debtor) or
without one, i.e. *Record a payment* (creditor); the settle screen re-resolves the pair against live
balances and takes any amount up to the bound (ABA-652). Sends are fire-and-forget through
`logFireAndForget`. The preference is `User.notifyGroupReminders` (default `true`), `groupReminders`
on `GET/PATCH /users/me/notification-preferences`, toggled in `NotificationsSettings.tsx` (the phone
screen and the desktop settings pane are the same component) and included in the master switch.
Copy: four push strings × 9 locales in `notification-i18n.ts`; the amount prints as `42.00 PLN`
(currency code, like debt reminders). Related: [debt-reminders](debt-reminders.md).

**Multi-currency (ABA-654).** The group currency is the **ledger currency**; an expense may be entered
in another one and is converted **once, at write time**, by `GroupsService` over the pure
`apps/api/src/modules/groups/group-fx.ts`. `GroupExpense.amount` is always the group-currency figure the
ledger sums; five nullable columns hold what was entered: `originalAmount`, `originalCurrency`, `fxRate`
(the value of ONE original unit in the group currency, `Decimal(18,8)`), `fxRateSource`
(`provider` | `manual`) and `fxRateAt`. All NULL = entered in the group currency, which is every row
written before the migration (no backfill needed). `amount = round2(originalAmount * fxRate)`.
- **Rate.** The existing singleton `ExchangeRateService` (`GroupsModule` imports `CurrencyExchangeModule`)
  through `getRatesSafe` + `unitRate` in `apps/api/src/common/utils/fx.ts`, base = group currency. The
  provider has no history, so it is the rate **at entry time**, not at the expense date. A manual
  `fxRate` in the DTO overrides it. No rate and no override = 400 `FX_RATE_UNAVAILABLE`, before any write.
  A manual rate is bounded: when the provider has a rate for the pair, one more than 3x above or below it is
  400 `FX_RATE_IMPLAUSIBLE` (`FX_MANUAL_RATE_FACTOR`, create and edit alike); with no provider rate there is
  nothing to compare and it stands. `fxRateSource` is always stored, and the guest activity row shows a
  "manual rate" tag (`manualRateTag`, 9 languages) beside the original figure. **Known gap:** an edit that
  changes the rate does not record the previous one anywhere (the group event log only holds member events).
- **Currencies.** The group's own, or one of `SUPPORTED_RATE_CURRENCIES` (exported by
  `exchange-rate.service.ts`, the provider's list); anything else is 400 `CURRENCY_UNSUPPORTED`. A
  converted amount outside 0.01 .. 1 000 000 is 400 `FX_AMOUNT_OUT_OF_RANGE`.
- **Shares.** Equal, percentage and shares resolve on the converted amount. An **exact** split is typed in
  the original currency: it must add up to the original amount, then the values are applied as
  **weights** to the converted amount (`resolveConvertedShares`), so the shares sum exactly to the stored
  amount, residual cent on the last member. `shareValue` keeps the original-currency values.
- **Edits** (`planExpenseFxEdit`): a new amount alone reuses the **stored** rate (source and timestamp
  unchanged); a new currency fetches a new provider rate or takes the override; a changed `fxRate` alone
  is a manual override; back to the group currency clears the columns; anything else touches no figure.
- **Preview.** `GET /groups/:groupId/fx-preview?currency=` (`ThrottlerGuard` 30/min + `GroupMemberGuard`)
  returns `{groupCurrency, currencyCode, rate | null}` for the form. It writes nothing.
- **App.** `GroupExpenseForm` has a currency chip beside the amount (group currency first, then the app's
  `SUPPORTED_CURRENCIES`) and, when foreign, an editable **Exchange rate** row seeded from the preview,
  with the converted figure under it. `buildFxBody` sends `currencyCode` always and `fxRate` only when the
  user typed one, so an untouched rate means "provider" on create and "reuse the stored one" on an edit.
  An edited foreign expense reopens with its original amount, currency and stored rate. A scanned
  receipt's own currency is applied when the group accepts it. One form serves the phone screen and the
  desktop dialog. Rows (`GroupActivityList`, desktop `GroupActivityTable`) show the original as a
  secondary line above the stored figure (`€12.00 →` over `51.80 zł`, `fxAmountParts`), read as stored.
- **Guest page.** A `<select name="currency">` (group currency first and selected, then the provider list)
  under the amount; no script, so no live preview. The server re-checks the field against the allowed list
  (a non-string, an unknown or a lowercase code is the `invalid` flash) and converts; the flash is
  `addedfx` ("converted to PLN at today's rate") or `norate` on an unknown rate. History rows show
  `30.00 EUR → 120.00 PLN`. CSRF, `Sec-Fetch-Site`, `Referrer-Policy: same-origin` and the write
  ceilings are unchanged. A guest who dislikes the rate deletes their own expense and re-enters it.
- **Settlements** stay in the group currency; nothing about them changed.

**Line items and claims (ABA-655).** An expense can be **itemised**: it carries its receipt lines
(`GroupExpenseItem`: name, gross `totalPrice`, optional `lineDiscount`, `position`; at most 100) and an
optional basket `discountAmount`, and each member claims the lines they had (`GroupItemClaim
{itemId, memberId, shareBp?}`, unique per line and member). Phase-2 spec section G
(`docs/superpowers/specs/2026-10-09-shared-groups-phase2-design.md`).
- **The math is receipt-split's, imported, not copied.** `group-items.ts` calls `resolveItemSplit` and
  `allocateItemShares` from `apps/api/src/modules/receipt-split/split-calculator.ts` (a pure file with no
  imports, so there is no module cycle) with **every member who claims as a participant, the payer
  included**. The payer's share = their own claims + `ownShare` (unclaimed lines, rounding, and anything that
  is not a line, such as a deposit). A line claimed by several people divides equally; a line with an explicit
  `shareBp` uses the numbers and the rest of it is the payer's (a claimant with no bp on a hand-split line takes
  nothing, as in receipt-split); per-line discounts and the `(lines - discount) / lines` basket scaling come with
  it. `validateItemLines` refuses lines that cannot fit what was paid (net lines minus the basket discount above
  `amount`: 400 `ITEMS_INVALID`), `validateClaimShares` applies receipt-split's bp rules (whole numbers
  0..10000, at most 10000 per line; 400 `CLAIM_SHARE_INVALID`).
- **Materialised as ordinary shares.** The resolved per-member amounts are written as `GroupExpenseShare` rows
  of an `exact` split (`itemized = true` on the expense; the trip `ShareType` enum is untouched), so
  `loadState`, balances, reminders, the guest page and admin metrics never learn about items. With no claims
  the payer holds the whole amount.
- **Foreign currency (ABA-654).** Lines and `discountAmount` are in the entry currency; the split is computed
  there against `originalAmount`, and the per-member results are converted with `resolveGroupShares(amount,
  'shares', ...)` as weights, payer last, so the shares sum exactly to the stored group `amount`
  (`toGroupCurrencyShares`). `shareValue` keeps the entry-currency figure.
- **Writes.** `POST /groups/:id/expenses` with `items` (and no `splitType`/`shares`) creates an itemised
  expense with `claimsOpenUntil = now + 7 days`. A claim change (`GroupItemsService.mutate`) runs in ONE
  `$transaction` that first takes the expense row's lock (a no-op `update`), re-reads the expense inside it,
  applies the lock rule, rewrites the claims (delete + recreate), re-derives the shares and, **only when they
  moved**, rewrites them and bumps `ledgerVersion` (a no-op submit therefore does not stale anyone's settle
  form). The `group_activity` push goes only to app users whose share moved (`notifyMembers`, still coalesced).
  `PATCH` on an itemised expense refuses `splitType`/`shares` (400 `EXPENSE_ITEMIZED`), takes `items` as the
  full new list (an `id` keeps a line and its claims; a missing line is deleted and its claims cascade, which
  prunes stale claims in storage), follows the ABA-654 figure rule, and re-derives the shares the same way;
  `items`/`discountAmount` on a non-itemised expense is 400 `EXPENSE_NOT_ITEMIZED`.
- **The lock rule (user decision, 2026-10-09).** While `claimsOpenUntil` is in the future, **every live member
  sets their own claims** (app `PUT .../claims/me`, or the guest form). After it, or once the payer, creator or
  owner closes the receipt (`POST .../claims/close`, which sets `claimsOpenUntil = now`; `{reopen: true}` gives
  another 7 days), a self-claim is 409 `CLAIMS_CLOSED` (guest flash `claimsclosed`). The **payer, creator and
  owner** (`canManageClaims`) can set anyone's claims and bp at any time (`PUT .../claims`) and may self-claim
  after the window too: exactly the authority they already have over the expense's shares. Archiving freezes
  everything (`GroupActiveGuard` and the guest pipeline). Closing writes no ledger. **Why not receipt-split's
  rule** (lock once anyone claimed or settled): on an ongoing ledger settlements are not tied to expenses, so
  "anyone settled" is true almost at once and most people would never get to claim; "never lock" would let a
  late visitor reshape co-claimants' shares months later. The window gives a predictable period in which the
  bill is divided, after which it is as stable as any expense.
  The creator of an expense paid by someone else may manage its claims (they are the one who framed it); every
  member whose share moves as a result is notified by the usual coalesced push, and the activity trail still
  names the creator, so this is accepted rather than restricted to the payer.
- **Removed members and claim races (review H1/M1/M3/M4).** `removeMember` is 409 `MEMBER_HAS_OPEN_CLAIMS`
  while the member holds claims on an itemised expense whose window is still open; it takes those expenses'
  row locks and re-checks inside one transaction. Every claims read and write treats a member with `removedAt`
  set as unclaimed (`dropRemovedClaims`), so stale claims never dilute or move shares and are pruned on the
  next write; a claim transaction re-checks the actor's liveness after taking the lock. Claim changes are
  limited to 10 per member per expense per hour (`grp:claim:{expenseId}:{memberId}`, app and guest, 429
  `CLAIMS_BUSY`, fail closed with 503 on a Redis outage; guest flash `busy`). `closeClaims` and an itemised
  edit take the expense row lock first; the edit re-reads the row `{id, groupId, deletedAt: null, itemized}`
  under the lock and re-plans from it, so a concurrent delete is a 404 and is never revived.
- **A claim change never re-validates or voids a settlement.** A settlement is money that moved (the MVP's rule
  for expense edits); a share that shifts afterwards simply reopens a small balance, which the suggested
  transfers then show. To make that visible, `loadState` returns `hasOpenItemClaims` and
  `GroupDetail.hasOpenItemClaims` (false on an archived group) drives a "Some receipts are still being divided,
  so amounts may still change" note on the settle surfaces; the guest page shows it in **Who pays whom**.
- **App routes** (`groups.controller.ts`, all `JwtAuthGuard` + `GroupMemberGuard`; the expense, every item id and
  every member id re-scoped `{id, groupId}` in `GroupItemsService`, members also `removedAt: null`):
  `GET /groups/:groupId/expenses/:expenseId/items` -> `GroupExpenseItemsView` (lines with their claims, the
  caller's `myPart` per line in `itemCurrency`, the resolved shares, `claimsOpen`, `canManageClaims`,
  `canClaim`, `ledgerVersion`); `PUT .../claims/me {itemIds}` (full set; a foreign line id is 404);
  `PUT .../claims {claims: [{memberId, itemIds, shareBp?}]}` (listed members replaced; `shareBp` omitted keeps
  their stored bp on kept lines, sent is their full map); `POST .../claims/close {reopen?}`. The three writes add
  `ThrottlerGuard` per route (30, 30 and 10 per minute) and `GroupActiveGuard`. Shared types:
  `GroupExpenseItemView`, `GroupItemClaimView` (entities), `GroupExpenseItemsView`, `SetMyGroupClaimsDto`,
  `SetGroupClaimsDto`, `GroupClaimEntryDto`, `CloseGroupClaimsDto`, `GroupExpenseItemInputDto` (dto);
  `GroupExpense` gained `itemized`, `discountAmount`, `claimsOpenUntil`.
- **Guest claim form.** For a cookie member on an active group, `buildPage` lists at most 5 open itemised
  receipts (newest first; `listOpenForGuest` filters on `itemized` and the window in the query and again in
  code), each a collapsed `<details>` with one row per line: name (`escapeHtml`), net price, "split N ways",
  "your part", a checkbox `c_<itemId>` and a hidden `l_<itemId>=1` for **every rendered line**, so the server
  tells "unticked" from "not shown". A hand-split line (any explicit bp) is rendered read-only with **neither
  key**, and the server drops hand-split lines from a guest's scope too (`skipHandSplit`), so even a crafted
  POST can never touch it. `POST /g/:token/expenses/:expenseId/claims` (`ThrottlerGuard`
  10/min) goes through the full `guarded()` pipeline (usable group, not archived, cookie actor, CSRF, write
  ceiling, in that order), parses only keys matching `^[lc]_<uuid>$` (at most 200), and calls
  `setMyClaims(..., {scope: l-keys, strict: false})`: the ids are intersected with the expense's real lines, a
  planted or foreign id is ignored, explicit bp on kept lines stays, newly ticked lines divide equally; 303 with
  flash `claimed`. Guests claim equal shares only and never create itemised expenses. `Sec-Fetch-Site`,
  `Referrer-Policy: same-origin` and the CSP are unchanged. 11 strings x 9 locales in
  `group-guest-page-i18n.ts`.
- **App UI (ABA-656).** Pure logic in `apps/mobile/src/features/groups/groupItems.ts` (unit-tested; nothing renders
  in CI).
  - *Creating.* `GroupExpenseForm` has an **Itemised (split by receipt lines)** switch on a NEW expense only (an
    edit keeps the expense's kind: the server refuses items on a plain expense and a split on an itemised one). On,
    `GroupItemsEditor` replaces `GroupSplitEditor`: name, price and line discount per line, a receipt discount, the
    lines total, "the rest stays with the payer" and **Use the lines total as the amount**. `validateItemDrafts`
    mirrors the server's `validateItemLines` (1..100 lines, names 1..120, 2-decimal prices, line discount at most its
    line, receipt discount strictly below the lines' net, net minus discount at most the amount), so Save is disabled
    with a reason; a 400 `ITEMS_INVALID` that still gets through is an alert. The body sends `items` and
    `discountAmount` and NO `splitType`/`shares`; on an edit `items` is the full list with each kept line's `id`, and
    an empty receipt discount is `null`.
  - *Scanning.* The form's existing scan now also maps `receiptItems` through `linesFromScan`: a negative line is a
    discount folded into the line above (capped at that line, the rest to the receipt discount), zero lines are
    dropped, names trimmed to 120, at most 100. Filled straight in when itemised; otherwise kept, so switching the
    toggle on after a scan prefills the lines (unless some were typed).
  - *Editing an itemised expense.* `GroupExpenseScreenView` loads `GET .../items` first (`useGroupExpenseItems`)
    and renders the form only once the lines have answered, never an empty editor for a receipt it has not read.
  - *Claims.* `GroupClaimsView` (phone route `app/groups/[id]/claims.tsx?expenseId=`, header *Divide the receipt*):
    the expense, the window (*Open for claims until 16 Oct · Days left: 7*, or *Claims are closed*), the caller's
    total, and two tabs. **My lines** ticks lines into a draft and **Save my lines** sends the full set to
    `PUT .../claims/me`; the "your part" figures of an unsaved draft come from `previewMyParts` (receipt-split's
    rule: equal slices with the newcomer counted, the caller's explicit share on a hand-split line, the basket
    scaling) and are replaced by the server's `myPart` after the save. A hand-split line is read-only there, as on
    the guest page (ticking it would give nothing). **Everyone** (only when `canManageClaims` and the group is
    active) toggles members per line with chips and opens receipt-split's `LineShareEditor` for percentages (its
    new optional `remainderLabel` names the payer instead of "You"; receipt-split passes nothing and is unchanged);
    **Save claims** sends one `PUT .../claims` entry per live member with their full line set and full `shareBp`
    map (`buildManagedClaims`; an over-allocated line blocks it). **Close claims** (confirm) / **Reopen for 7 days**
    call `POST .../claims/close`. 409 `CLAIMS_CLOSED` reloads the view and says so; 429 `CLAIMS_BUSY` and 400
    `CLAIM_SHARE_INVALID` are worded alerts. Every write is a `GroupButton write` (offline-gated) and reloads the
    group afterwards, since claims move balances. Removing a member who still holds claims on an open receipt
    (409 `MEMBER_HAS_OPEN_CLAIMS`) has its own message in the members screen.
  - *Rows.* An itemised row (phone `GroupActivityList`, desktop `GroupActivityTable`) carries *Itemised · open
    until 16 Oct* (or *claims closed*) under its meta, and tapping it opens the claims for **every** member
    (`expenseRowTarget`: claims are not gated on edit rights, and an archived group shows them read-only). The
    claims screen has **Edit expense** for whoever may modify it. `GroupExpense` has no line count, so the badge
    shows none.
  - *Settle note.* `GroupOpenClaimsNote` ("Some receipts are still being divided, so amounts may still change")
    shows while `GroupDetail.hasOpenItemClaims` in `GroupSettleView` (phone screen and the desktop dialog, which
    hosts it) and in `GroupTransfersCard` (phone detail and desktop rail), as the guest page's *Who pays whom* does.

**Members.** Removal is soft and requires a zero balance. The owner cannot leave while they own
the group: they transfer it first (below), then leave like anyone else. A member the
owner removed (`removedByOwner`) cannot walk back in through the link (403 `GROUP_REMOVED`); a
self-removed one may rejoin through the normal archive and member-cap checks. The member cap is
enforced inside a transaction that first locks the group row, so concurrent joins cannot overshoot
it.


**Joining from the app (ABA-647).** The join screen first calls `GET /groups/preview?guestToken=`
(throttled 20/min): the group's name, emoji, currency, status and the free names — live placeholders
with no `userId` and no `claimTokenHash`, as id + display name only. Unknown, guest-access-off and
deleted links are one identical 404, like the guest page. The user picks a free name
(`POST /groups/join {guestToken, memberId}`, atomic; 409 `MEMBER_TAKEN` re-fetches the preview) or
"I'm not on the list" with a new name. `groupId` and `myMemberId` come back only to someone who is
already a live member, so "Open group" goes straight there. A name a guest already claimed in the
browser can still only be taken over with a link code.

**Join provenance (ABA-647).** `ExpenseGroupMember.joinedVia` (`owner`, `placeholder`, `app_link`,
`guest`, `guest_linked`) and `linkedAt` record how each member arrived, for the admin Groups page.
Rows created before 2026-10-09 have none (no backfill).

**Ownership (ABA-650).** `ExpenseGroup.ownerUserId` is nullable; NULL means **orphaned**.
`GroupOwnershipService` (`apps/api/src/modules/groups/group-ownership.service.ts`) owns it:
- **Manual transfer** `POST /groups/:groupId/owner {memberId}` (`ThrottlerGuard` 10/min +
  `GroupMemberGuard` + `GroupOwnerGuard` + `GroupActiveGuard`). The target is re-scoped
  `{id, groupId, removedAt: null}` and must have a `userId` whose user `isActive`, and must not be the
  caller (400 `OWNER_TARGET_INVALID`); 409 `OWNER_LIMIT` when the target already owns 20 active groups.
  The write is `updateMany where {id, ownerUserId: <caller>}` (a CAS: count 0 is 409 `OWNER_CHANGED`),
  plus an event row, in one transaction, then a push to the new owner (`group_activity` type, so the
  activity toggle gates it).
- **Departure** `handleOwnerDeparture(userId)`: each owned group passes to the earliest-joined
  (`createdAt`, then `id`) live member with an active account; nobody eligible = orphaned. It is a CAS
  on the departing owner too, so a transfer that landed first wins. Called **before** the account
  changes through `leavePlatform(userId, { anonymize }, then)`, which runs departure, the optional
  anonymization and the account change (`then(tx)`) in ONE `$transaction`, so a failure leaves nothing
  half-done; pushes to new owners go out after the commit. Callers: `UsersService.deactivate`
  (`DELETE /users/me`, a soft delete, `anonymize: true`), `AdminService.deleteUser` (`anonymize: true`)
  and `AdminService.deactivateUser` (a reversible suspension, `anonymize: false`).
- **Anonymization** (self delete and admin hard delete): every member row of that user (removed
  ones too) becomes "Former member" (`Former member 2`, ... when the name is taken in that group, since
  `nameKey` is unique per group), with its payment details and claim cleared, and every event
  `subjectName` snapshot of that member is renamed as well. The row stays (shared ledger history); the
  member `userId` FK is `SetNull`. User decision of 2026-10-09. The stored name is English in every
  locale, because it is stored text. There is no P2002 retry (a poisoned transaction cannot retry): a
  name clash aborts the whole delete, which the user repeats.
- **Backstop.** The owner FK is `onDelete: SetNull`, no longer `Cascade`: a deletion path that forgets
  the hook orphans the group instead of deleting it for everyone.
- **Orphans** stay fully usable by members and guests; `GroupOwnerGuard` refuses everyone, so only
  owner actions wait. `GroupDetail.isOrphaned` is true, `isOwner` false for all, `ownerMemberId` null.
  Adoption is ONLY the explicit `POST /groups/:groupId/adopt` (`ThrottlerGuard` + `GroupMemberGuard` +
  `GroupActiveGuard`, deliberately not owner-only; 409 `GROUP_HAS_OWNER` / `OWNER_LIMIT`, 403
  `ADOPT_NOT_ELIGIBLE`) through `adoptIfOrphaned` (`updateMany where ownerUserId: null`, respecting the
  20-group cap). Joining, rejoining, claiming a placeholder or linking a guest row never adopts: with
  the link as the only requirement that would let anyone holding it take an ownerless group.
  Eligibility (`isAdoptionEligible`) is a live app-user member whose `createdAt`, `claimedAt` and
  `linkedAt` all predate `ExpenseGroup.orphanedAt` (a rejoin restamps `claimedAt`). `orphanedAt` is set
  by the departure step and, for the SetNull FK backstop, by the `expense_groups_orphaned_at` trigger
  in the migration; adoption clears it. `GroupDetail.canAdopt` carries the verdict to the app.
- **Existing headless groups** were fixed by the migration's data step: every group whose owner was
  already inactive got the earliest-joined active app-user member, or NULL, plus an event row.

**Claim reset (ABA-651).** `POST /groups/:groupId/members/:memberId/reset-claim` (`ThrottlerGuard`
10/min + `GroupMemberGuard` + `GroupOwnerGuard` + `GroupActiveGuard`; `GroupsService.resetClaim`) frees
ONE guest's browser claim: `claimTokenHash` and `claimedAt` go NULL on that row only. The target is
re-scoped `{id, groupId, removedAt: null}`; a foreign, removed or app-user id is one 404 (an app user's
identity is the JWT, there is nothing to reset), an unclaimed one 409 `NOT_CLAIMED`. The write is
`updateMany` with the hash that was read in its `where` (a CAS, so a concurrent forget or link loses
cleanly as `NOT_CLAIMED`) plus a `claim_reset` event (actor = the owner, subject = the guest, no
target) in one transaction. No `ledgerVersion` bump. Effects: that device's cookie no longer
identifies anyone (`identify` / restore return null), the name is on the guest picker and the app's
join preview again, and an outstanding link code from that claim fails at redemption (above). The
member row, its expenses, shares, settlements and balance are untouched. App: **Reset this person's
login** in `GroupMemberSheet` (owner, active group, a live claimed guest: `canResetClaim` in
`apps/mobile/src/features/groups/groupOwnership.ts`), behind a destructive `showAlert` confirm,
`GroupButton write`; the same sheet serves the phone screen and the desktop members dialog through
`GroupMembersView`. The guest page shows nothing (the event is filtered in the query).

**Event log (ABA-650).** `GroupMemberEvent` (`kind` `owner_transferred | member_merged | claim_reset`,
`actorMemberId?`, `subjectMemberId`, `targetMemberId?`, `subjectName` snapshot). Member columns are
plain ids with **no FK**, so a merge (ABA-657) never re-points audit rows: the absorbed row stays,
soft-removed, and old events keep resolving to its name. `owner_transferred`
covers four cases told apart by its fields: actor = subject = old owner and a target is a manual
transfer; no actor is a succession; no actor and no target is orphaning; subject = target is an
adoption (`apps/mobile/src/features/groups/groupOwnership.ts` `describeGroupEvent`). `getActivity`
merges it as a third source (`{kind: 'event'}`), with the actor's and target's CURRENT names.
`GUEST_VISIBLE_EVENT_KINDS` (`member_merged` only) is applied **in the query** for the guest page,
and the guest service drops any other kind a second time: an owner or claim-reset event would reveal
that a member is an app user.

**Merging two members (ABA-657).** For one person who ended up in a group twice ("Ania" in the
browser and "Ania" in the app, or "Ania (2)" after a lost cookie). Phase-2 spec section D. The pure half is
`apps/api/src/modules/groups/group-merge.ts`; `GroupMergeService` (`apps/api/src/modules/groups/group-merge.service.ts`,
Prisma only, so `GroupsService` can inject it for the link-code path without a cycle) runs it.
- **Routes.** `POST /groups/:groupId/members/:memberId/merge {intoMemberId}` (`ThrottlerGuard` 10/min +
  `GroupMemberGuard` + `GroupActiveGuard`; deliberately NOT `GroupOwnerGuard`, because absorbing an unclaimed
  name is open to any member, so the consent rule is in the service) → `GroupDetail`. And
  `POST /groups/link-guest {code, merge: true}`: the self-merge.
- **Direction and consent** (`normaliseMergePair`, `mergeConsent`). Never two app-user rows (409
  `BOTH_APP_USERS`); an app-user `from` with a guest `into` is swapped, so the app user's row survives and the
  absorbed row is always a guest. The **owner** may merge into an UNCLAIMED guest row or into their own row (a guest row
  another person's browser has claimed is 403 `MERGE_NOT_ALLOWED`); **any member** may absorb an UNCLAIMED guest
  row (an unclaimed placeholder) into their own row. This is deliberate: it is no more power than claiming that
  placeholder through the guest link, which anyone holding the link already has; nothing
  may push a balance onto another app user's row (403 `MERGE_NOT_ALLOWED`) — they consent by doing it
  themselves. Same id 400 `MERGE_SAME_MEMBER`; foreign, removed (including already merged) or unknown ids one
  404; archived 403 `GROUP_ARCHIVED` (re-checked under the lock).
- **One `$transaction`.** It first bumps `ledgerVersion` (the group row lock: every other ledger write waits,
  every open settle form goes stale), then re-scopes both ids and the actor `{id in, groupId, removedAt: null}`,
  applies the consent rule, snapshots the balances, and re-points: expense `paidBy`/`createdBy`/`deletedBy`,
  settlement `from`/`to`/`recordedBy`/`voidedBy`, shares and claims. Then `from` gets `removedAt`,
  `claimTokenHash`/`claimedAt`/payment details NULL and `mergedIntoMemberId = into` (a CAS `updateMany` on the
  state read under the lock), the balances are **re-read from the database** and `checkMergeBalances` asserts
  that `into` holds exactly the old pair sum, `from` nothing, and every other member (removed strays
  included) moved by less than half a cent. A failure is logged and throws 500 `MERGE_INVARIANT`, which rolls
  everything back: it is a bug, not user input. Last, the `member_merged` event (actor, subject = `from` with its
  name snapshot, target = `into`), shown in the app and, as before, on the guest page (`GUEST_VISIBLE_EVENT_KINDS`).
- **Shares** (`planMemberMerge`). Where only `from` is on an expense, the row is re-pointed. Where both are,
  `into`'s row takes the summed `shareAmount` and `from`'s is deleted (`@@unique([groupExpenseId, memberId])`);
  `shareValue` is summed for exact (original-currency values on a converted expense), percentage and shares. An
  **equal** split both were on becomes a **`shares`** split (`into` 2 units, everyone else 1), deviating from
  the spec's "NULL for equal": an equal split re-resolved by a later edit would otherwise divide the amount n-1
  ways and silently move money. Converted (ABA-654) and itemised rows need nothing special: balances are only
  `paidBy` and share amounts.
- **Claims** (ABA-655). A line only `from` claimed is re-pointed (its bp kept). A line both claimed: `from`'s
  claim is deleted and `into` keeps the line — whole when the pair were the only claimants; on a hand-split line
  with bp summed (null reads 0, capped 10000); on an equal line with a third claimant, every remaining claimant
  is converted to explicit bp at its current fractions (`apportionBp`: `into` 2 slices, others 1, summing to
  exactly 10000), so the third person's slice does not grow from 1/n to 1/(n-1). A removed member's claim counts
  as unclaimed here too. **The merge does not re-derive an itemised expense's shares**, unlike the spec's step 3:
  it sums the share rows like any expense, which keeps every balance to the cent by construction. A third of a
  line is not a whole number of basis points, so a re-derivation could move a cent between the third claimant
  and the payer and would trip the assertion. The next claim change re-derives as usual (within a cent).
- **Settlements between the pair** become `into -> into` and are **voided** (`voidedByMemberId` = the actor):
  their effect on the pair summed to zero. Already-voided ones are only re-pointed.
- **Event rows are not re-pointed** (no FK, by design above). Reminder columns on `into` are left to the cron.
- **Every ledger writer locks first (ABA-657 review H1).** `GroupsService.lockGroup(tx, groupId, bump)` is the
  first statement of the transaction in `createExpense`, `updateExpense`, `deleteExpense`, the itemised
  create/update, `voidSettlement` (bumping `ledgerVersion`, which replaces the old bump at the end), the claim
  writes in `GroupItemsService.mutate` and `removeMember` (no-op lock). It re-checks the group is active (403
  `GROUP_ARCHIVED`), and the writer then re-checks every referenced member is live with `assertLiveMembers(..., tx)`
  on the state the lock protects; `removeMember` runs its zero-balance rule under the lock too, and the settle CAS
  re-checks status and both parties after it. The merge takes the same lock, so a writer that validated before a
  merge/removal fails after it instead of attaching shares or a payer to the soft-removed row; the bot path
  (`GroupBotService` -> `createExpense`) is covered by the same code. New ledger writers must do the same.
- **Link-code self-merge.** `linkGuest` runs its usual checks (GETDEL, rotation/guest-access/archive re-read, the
  ABA-651 claim digest). When the caller already has a LIVE row there, the 409 `ALREADY_MEMBER` carries
  `details: {canMerge: true, guestName, myName, guestBalance, currencyCode}` (the caller holds the guest's own
  code, so naming that row is no leak; `guestBalance` is its current net balance in the group currency, shown in
  the confirm so it is informed) and **the unspent code is put back**, since nothing was bound, with its REMAINING
  lifetime (the payload carries an absolute `exp`; a payload without one is not restored, and the restore never
  outlives the original 10 minutes) and **bound to the user who got the 409** (`mergeUserId`): another user
  redeeming it with `merge: true` gets 410 and the code is put back for its user.
  `{code, merge: true}` then calls `mergeViaLinkCode`: `from` = the guest row, `into` = the caller's row, and the
  guest row is a CAS on the very claim hash the code was checked against, so a reset or re-claim landing in
  between is 410 and rolls back. A removed caller row gets `canMerge: false` and the code is not kept.
- **App.** `GroupMemberSheet` has **Merge with…** (when `canMergeMember`, `apps/mobile/src/features/groups/groupMerge.ts`,
  which mirrors the server rule) that turns the sheet into a picker of `mergePartners`; picking one opens a
  destructive `showAlert` confirm in `GroupMembersView` naming the direction, the survivor's resulting balance
  (`mergedBalancePreview`, a client-side sum labelled as a preview) and "This cannot be undone". Every button is
  `GroupButton write` (offline-gated). The same sheet serves the phone screen and the desktop members dialog.
  `GroupLinkView` (the same centred screen on both) shows the offer when `processGroupLink` reports
  `mergeOffer`: **Merge “Ania” into your account** (`mergeGroupLink`) or **Not now**; the post-sign-in flush
  instead re-opens `/groups/link?code=` so the screen asks again. 16 strings x 9 locales; no guest-page copy
  changed.

**Settling in the app (ABA-652).** `GroupSettleView` has an editable amount: it opens at the
suggested transfer (`defaultSettleAmount`), shows the bound ("up to …") and a validation message,
and the confirm button stays disabled while the text is invalid (`checkSettleAmountInput`, which
mirrors the server's bound, clamp and two-decimal rule; `maxSettleAmount` mirrors
`maxSettlementAmount`). The pure helpers are in `apps/mobile/src/features/groups/groupMath.ts`.
Opened **without** a pair it is **Record a payment**: `settleCounterparts` lists everyone the user
can settle with (a debtor picks any creditor, a creditor any debtor who owes them; suggested
partners first, removed members never), each with its own bound. The entry is a secondary
`GroupButton write` on the phone's `GroupDetailView` and a toolbar button in `GroupDetailDesktop`
that opens `GroupSettleDialog` with no pair (titled *Record a payment*); both show only when
`canRecordPayment` (an active group with someone to settle with). The route `/groups/:id/settle`
with no `from`/`to` opens the same mode on both. When the server refuses the amount
(`exceedsBalance`), the store reloads the group and the screen stays open with the new bound.

**Ownership in the app.** `GroupMemberSheet` gains **Make owner** (the owner, an active group, another
live app-user member: `canMakeOwner`) behind a `showAlert` confirm; `GroupOwnerControls` shows "make
another member the owner to leave" where the owner's leave action would be; `GroupOrphanBanner` (phone
`GroupDetailView`, desktop `GroupDetailDesktop` above the hero) explains the orphan state and offers
**Become the owner** only when `GroupDetail.canAdopt` is true. All three are `GroupButton write`, so offline gating applies. Event rows render
in `GroupActivityList` and, on desktop, in `GroupActivityTable` as a system row: no subtotal, not
focusable, left out of the keyboard `order` (so `Enter` cannot land on one).

## Invariants

- **Groups must not move into `Account`/`Expense`.** The model is standalone on purpose (above);
  a group write must never create an `Expense` or `Income` row in this iteration — that is what
  keeps every personal total free of group money without a filter.
- **Every incoming member, expense and settlement id is re-scoped to the group** (`{id, groupId}`,
  members also `removedAt: null`) before use. The group itself comes from the guard (app) or the
  token (guest), never a body field. That is the IDOR line.
- **The guest actor comes only from the hashed cookie secret.** Never accept a member id from a
  form as "who I am" — a member id in a form is a target, re-scoped, never an identity.
- **A settlement is validated against the current balances before any write, and the write is a
  CAS on `ledgerVersion`.** Without the CAS a double-tap, or two members settling the same
  transfer, mints two settlements.
- **A payment can only shrink both balances; it never flips a sign** (ABA-652). `from` must owe,
  `to` must be owed, and the stored amount is clamped to `min(owed, owed-to)`. Loosening this to
  "any amount between any two members" would let anyone record "I paid 1000" and become a
  creditor. The client bound is only a convenience; the guest form's amount field is free text and
  the server is the check.
  The bound is **point-in-time, on purpose** (security review of ABA-652): a later expense edit or
  delete can move balances so that an earlier payment now overshoots and the payer becomes the
  creditor. That is correct accounting — a settlement is money that really moved — so payments are
  never re-validated or auto-voided. Likewise a debtor may record "I paid" to any current creditor
  without the receiver confirming first; the receiver gets the `group_activity` push (app users)
  and can void it, and history shows who recorded it.
- **Every ledger write bumps `ledgerVersion` inside its transaction**, or a stale settle form
  validates against balances that have since changed.
- **Write ceilings fail closed and are charged only after the actor and CSRF checks**, so an
  anonymous or forged request never spends a member's budget and a Redis outage never means
  unlimited public writes.
- **Unknown, disabled and deleted tokens are byte-identical.** The page carries money and names, so
  the `sl/` single-query shortcut does not apply here.
- **The restore code travels in a POST body, never a URL**, and nothing mutates on a GET.
- **Rotation resets every claim.** Do not "preserve" claims across a rotation: a leaked link is the
  reason to rotate, and a leaked link may have come with a claimed device.
- **The link-handoff destination is a constant base**; only the minted code is appended.
- **Copy never promises "the minimum number of transfers"**, because `simplifyDebts` is greedy.
- **A group never cascades away with its owner.** The owner FK stays `SetNull`, and every path that
  ends an account (soft or hard) calls `GroupOwnershipService` BEFORE the account changes. A new such
  path must call it too, or it leaves headless groups (the FK only covers the hard delete).
- **Every owner change is a CAS on the current `ownerUserId`** (transfer: the caller; departure: the
  departing user; adoption: NULL). A plain `update` would let a transfer and a departure, or two
  adopters, both apply.
- **Only a live member with an active app account can own a group**, and only through the owner's own
  transfer, a departure succession or the adoption of an orphan. Never set `ownerUserId` from a body
  field: the target is a member id, re-scoped to the group.
- **The guest page shows `member_merged` events only**, filtered in the query. `owner_transferred` and
  `claim_reset` would tell a browser visitor which members use the app.
- **A claim reset touches one row's `claimTokenHash`/`claimedAt` and its `paymentMethod`/`paymentHandle`
  and nothing else** (ABA-651). The payout details are cleared in the same transaction so the next
  person to pick that name does not inherit the previous claimant's. It never rotates the token,
  never clears another member's claim, never moves money; that is what makes it safe to offer
  instead of a rotation.
- **A claim reset is owner-only and only for a live, claimed guest.** App-user rows are refused: a
  reset there would do nothing for the person and would let the owner probe who uses the app.
- **A link code is bound to the claim that minted it**, not just to the member id. Without the
  `claim` binding, a code minted by a device the owner just reset (the "someone else claimed Ania's
  name" case) would still turn that device into Ania's app account for 10 minutes.
- **Adoption is never a side effect of joining.** Only members who were live before `orphanedAt` may
  adopt, and only through the explicit route.
- **Account deletion (self or admin) is one transaction** with the ownership moves and the rename;
  a suspension hands groups on but does not anonymize.
- **A hard or self delete renames, it does not delete, the member rows**, and renames the event snapshots with
  them; the balances must keep adding up for everyone else.
- **A guest (no `userId`) is never reminded and its row never gets reminder state.** Guests have no
  push; an email or SMS to them is out of scope.
- **At most one reminder push per user per UTC day, weekly per episode, at most 4 per episode**
  (threat 12 of the phase-2 spec, reminder spam). Do not lift the per-user cap to "one per group":
  a user in five groups would get five pushes in one evening.
- **The reminder send is a compare-and-swap on the member row's reminder columns**, which is what makes
  a re-run or a second instance a no-op. A plain `update` before or after the send double-sends.
- **A balance under 1.00, or a settled one, resets the episode**; a sign flip is a new episode. The
  count is per episode, never lifetime.
- **The reminder cron never writes the ledger** (no `ledgerVersion` bump, no hook on a ledger write), so
  no settle form goes stale because of it and no ledger write gets slower.
- **Opt-out is filtered before the claim and gated again in `NotificationsService`.** Removing either
  half either burns opted-out users' reminders or sends to them.
- **A foreign-currency expense is converted ONCE, at write time, and nothing converts on read**
  (ABA-654). `loadState`, `getDetail`, `getActivity` and the guest page read `amount` as stored and never
  call the rate provider. Converting at read time would let a settled ledger drift with FX and un-settle
  itself; a "refresh the rate" job is out of scope for the same reason.
- **An unknown rate is refused, never stored unconverted** (the display-currency invariant): 400
  `FX_RATE_UNAVAILABLE`, nothing written. Summing a foreign amount as if it were group currency is the
  bug `common/utils/fx.ts` exists to prevent.
- **An edit reuses the stored rate unless the currency (or the rate itself) changes.** Re-fetching on every
  edit would silently re-price old expenses that someone may already have settled against.
- **A manual rate is bounded to 3x of the provider's** (`FX_RATE_IMPLAUSIBLE`) and always stored as
  `fxRateSource: 'manual'`, shown as a tag on the guest page. A one-field typo (or a malicious rate) can
  otherwise move a debt arbitrarily; the guard is skipped only when the provider has no rate for the pair.
- **`amount` is always the group currency.** Every consumer (balances, reminders, the share-this-month
  figure, admin metrics) sums `amount`; the original columns are display data only.
- **The guest currency is a form field, so it is re-scoped to the allowed list on the server**, like any
  member id on that form. The rate provider is the existing `ExchangeRateService` singleton; do not
  provide a second instance or a second rate source.
- **Item math is receipt-split's calculator, imported** (ABA-655). Do not copy `resolveItemSplit` or
  `allocateItemShares` into the groups module: two copies of the discount scaling and remainder rules would
  drift, and the parity test in `group-items.spec.ts` compares against the receipt-split function itself.
- **The payer is a participant and the remainder is theirs.** Never invent a "payer row" or split the
  unclaimed part among claimants: whatever nobody claims (and any non-line amount such as a deposit) stays with
  the payer, and the shares sum to `amount` by construction (a subtraction in cents; for a converted expense,
  payer last as the residual of the weights).
- **Claims are materialised as ordinary `GroupExpenseShare` rows**, re-derived from ALL the expense's claims
  inside the same `$transaction` that bumps `ledgerVersion`, after the expense row's lock. The ledger, reminders
  and the guest balances must never read items; a second code path that sums claims would disagree with them.
- **The lock rule: 7 days open to every live member for their own lines, then (or after the payer, creator or
  owner closes it) only those three edit claims.** Do not lock on "someone settled" (receipt-split's rule): on
  an ongoing ledger that is almost always true, so nobody could claim. Do not drop the window either: a late
  visitor could then reshape co-claimants' shares months later.
- **A claim change never re-validates or voids a settlement**; it may reopen a balance, and the settle surfaces
  say so while `hasOpenItemClaims` is true. Auto-voiding would erase money that really moved.
- **A removed member never holds a claim that counts** (H1): removal is refused while they hold claims on an open
  receipt, and any leftover claim of a `removedAt` member is read as unclaimed everywhere. Do not "simplify" by
  loading claims without that filter, and keep the expense lock before the liveness check in the claim transaction.
- **Every claims write is under the expense row lock** (claim change, close/reopen, itemised edit, member removal),
  and an itemised edit re-reads the row under it. A delete must never be undone by a racing edit.
- **The guest claim form changes only the lines it rendered** (`l_` keys), only for the cookie actor, only lines
  of that expense in that group (intersected, never trusted), and never a hand-split line or an explicit bp.
- **No ledger write for a no-op**: a claim submit that leaves the shares unchanged does not bump
  `ledgerVersion`, so an idle re-submit cannot make everyone's settle form fail with "Balances changed".
- **A merge changes no balance except by moving `from`'s into `into`** (ABA-657), and that is asserted INSIDE the
  transaction on balances re-read from the database, aborting the whole merge otherwise. Do not move the check
  outside the transaction or compute it from the plan instead of the stored rows: it exists to catch a write
  that went wrong.
- **The merge sums share rows; it never re-derives an itemised expense's shares**, because a bp conversion of a
  three-way equal line cannot be exact and the re-derivation would move a third member's cent.
- **Whoever ends up holding the merged balance consents** (threat 3): the owner only into a guest row or their
  own row, a member only an unclaimed guest into their own row, the link code for a claimed guest. Two app-user
  rows never merge, and the survivor is always the app-user row.
- **A merge is the first write in its transaction to bump `ledgerVersion`**, so it serialises with every other
  ledger write and every settle form quoting the old version fails with "Balances changed".
- **The absorbed row is soft-removed, never deleted**, with `mergedIntoMemberId`; its name stays reserved and old
  event rows keep pointing at it.

## From the bots (ABA-658)

`group <amount> [currency] [description]` (Telegram `/group`) adds an expense from Telegram, WhatsApp
or Slack, with no AI call and no AI usage charge. One active group goes straight to a confirm card
("Flat · 120.00 PLN · pizza · paid by you · split equally among 4"); several give a picker of at most
10 by recent activity (`ExpenseGroup.updatedAt`, which every ledger write bumps): a Telegram inline
keyboard, a WhatsApp interactive list (its 10-row cap is the limit) or a Slack `static_select`. The
defaults are fixed: the payer is the user's own member row and the split is equal among every live
member. Anything else, and a group over the 20-share cap, gets "add it in the app".

- **One flow, three renderers.** `apps/api/src/modules/groups/group-bot.service.ts` (`GroupBotService`,
  exported by `GroupsModule`) owns the parse, the picker, the card and confirm/cancel, and returns a
  platform-neutral reply; each bot's `handlers/group.handler.ts` only renders it. The write is
  `GroupsService.createExpense` — the same path as the app and the guest page, never a second one.
  `apps/api/src/modules/groups/group-bot.ts` is the pure parser and the request-id derivation.
- **Authorization is re-resolved at every step** (picker choice, card, confirm) from the database:
  the linked identity's `userId` must be a live member of an **active** group. A callback carries
  only a draft id and an index into the draft's own candidate list, never a group id, and a draft is
  bound to the user who started it, so a replayed or forged callback reads as "expired". The
  **account viewer role is deliberately not applied** (locked decision 1): groups are not
  account-scoped, so a viewer of the bot's default account can still add to their group.
- **Drafts** live in `CacheService` under `telegram:grp:{id}`, `wa:grp:{id}`, `slack:grp:{id}` (TTL
  1800 s); a picker choice mutates the draft and writes it back with `cache.set`; confirm, cancel and
  every terminal refusal delete it.
- **Idempotency.** The expense's `clientRequestId` is derived from the platform's own message id
  (Telegram chat + message id, the WhatsApp wamid, the Slack channel + ts), so a redelivered command
  and a double-tapped Confirm both land on the existing `{groupId, clientRequestId}` dedup.
- **Currency** (ABA-654). A symbol or a code after the amount is the entry currency; the card shows
  a provider-rate preview ("100.00 EUR ≈ 430.00 PLN") and the write converts again at confirm. An
  unsupported code or a missing rate is refused with a clear message and nothing is written; a rate
  that disappears between card and confirm keeps the draft for a retry.
- **Date** is the server's calendar day (UTC), as for every other bot write. Strings: 13 `group*` keys
  in `common/bot-i18n/shared-messages.ts` (9 languages, pinned by `shared-messages.spec.ts`) plus one
  `helpText` line per bot.

## Desktop

At ≥1024 px web, **ABA-646** gives groups their own layout. Nothing here is rendered in CI; layout,
hover, focus and theme legibility are unverified until someone looks at the deployed build. The design
is `docs/superpowers/specs/2026-10-09-desktop-groups-receipts-report-design.md`.

- **Deciders.** `GroupsScreen` and `GroupDetailScreen` (`apps/mobile/src/components/groups/`) each have
  a native file that renders the phone body and a `.web.tsx` that picks `GroupsDesktop` /
  `GroupDetailDesktop` on `useIsDesktopWeb()`. The route files stay single: `groups/index`, `new`,
  `join` use the first, `groups/[id]/index`, `expense`, `settle`, `members` the second. The native
  file never imports `desktop/`. The phone bodies (`GroupsListView`, `GroupDetailView`,
  `GroupCreateForm`, ...) keep their names and single definition.
- **List** (`desktop/GroupsDesktop.tsx`): a toolbar, a per-currency summary strip (never blended,
  active groups only, dashes until the list has answered) and a table with a sticky header, active
  groups first. Pure logic is `apps/mobile/src/features/groups/groupListTable.ts`. `n` opens New group;
  `↑`/`↓` and `Enter` walk and open rows. The Currency column hides below 1280.
- **Detail** (`desktop/GroupDetailDesktop.tsx`): hero strip, a day-grouped activity table
  (`GroupActivityTable`, pure logic in `groupActivityTable.ts`) and a 320px rail with who-pays-whom,
  balances (`GroupBalancesCard`) and the invite link with an **inline QR** and a Copy button (Share is
  dropped: `Share.share` is unreliable on desktop browsers). One page scroll; the rail is not sticky.
  "Your share" hides below 1280.
- **Dialogs host the existing views.** Create, join, expense, settle and members open in
  `DesktopDialogFrame` dialogs that host `GroupCreateForm`, `GroupJoinView`,
  `GroupExpenseScreenView`, `GroupSettleView` and `GroupMembersView` unchanged. Overlay state lives in
  `GroupsDesktop` / `GroupDetailDesktop`; `GroupsDesktopDialogs` / `GroupDetailDialogs` only render it.
- **Every router call in a hosted view is an optional callback whose default is the old router
  call.** `onCreated(id)`, `onJoined(id)`, `onAlreadyMember`, `onDone`, `onLeftGroup`, and
  `useGroupOwnerActions(detail, onGroupGone?)`. The phone passes none, so it is unchanged. A dialog is
  not a route, so a `router.back()` / `router.replace()` inside one would navigate the page under it
  away. `GroupExpenseScreenView` takes `withStackTitle` (default true); a hosted copy passes false so
  the route underneath keeps its title.
- **Form footer buttons go through a ref handle.** `GroupExpenseForm` and `GroupCreateForm` are
  `forwardRef` with `GroupFormHandle { submit(); remove?() }` plus `hideActions` and a stable
  `onStateChange`, so the dialog footer drives the same save the in-form button runs.
- **Deep links still work.** `/groups/new`, `/join`, `/:id/expense`, `/settle` and `/members` (push,
  guest page, URL) render the list or detail desktop screen with the matching dialog open
  (`initialDialog`); closing `router.replace`s to the parent.
- **A settlement row is not a click target.** Phone: tap voids. Desktop: an explicit **Void** button
  in the actions cell (revealed on row hover and on its own focus, always focusable), then the same
  `showAlert` confirm, shared through `useGroupVoidSettlement`. A click that opens a destructive
  confirm is a hazard with a precise pointer.
- **No discard confirmation on the group dialogs**, as `TransferDialog`: `useGroupExpenseForm` has no
  real dirty signal, and inferring one is the spurious confirm `CreateDialog` documents.
- **`GroupMemberSheet` is a `SheetDialog`.** On the phone it reproduces the old sheet through
  `sheetStyle` / `handleStyle` / `scrimColor`; on desktop it is a centred dialog. It deliberately does
  not pass `keyboardAvoiding`, which would change the phone.
- **Claims dialog (ABA-656).** `desktop/GroupClaimsDialog.tsx` hosts `GroupClaimsView` unchanged
  (`withStackTitle={false}`, with its in-body buttons, since they depend on the tab the view is in). An itemised
  row's click, its `Enter` and a `receipt-outline` action in the actions cell (revealed on hover and on its own
  focus, like the pencil, which stays for editing) open it; `/groups/:id/claims?expenseId=` opens it through
  `initialDialog={kind: 'claims'}`. **Edit expense** inside it calls `onEditExpense`, which `GroupDetailDialogs`
  turns into `onSwitch({kind: 'expense'})`: the dialog is replaced, never a route push under it. The actions cell
  is now a row so the two icons sit side by side.
- **Entry points.** The dashboard rail has a seventh quick link (`groups`, in `railQuickLinks.ts`, not
  gated on edit or account type) and Settings has a permanent `groups` link, so a user who hid the
  quick action still has a door.

## Admin metrics

**ABA-647** adds `GET /admin/groups/metrics?days=` (1–365, default 30;
`apps/api/src/modules/admin/admin-group-metrics.service.ts`), shown on the admin **Groups** page
(`apps/admin/src/app/groups/page.tsx`). Aggregates only — no group name, member name, token or user
id leaves the service.

- **Totals are all-time except `activeGroups`**: non-archived groups with an expense or settlement
  created inside the window. `membersTotal` is current members (`removedAt: null`).
- **Provenance** is `ExpenseGroupMember.joinedVia` (`guest`, `guest_linked`, `app_link`) and
  `linkedAt`. `guestMembers` = `joinedVia` guest or guest_linked; `guestsLinked` = `linkedAt` set;
  `appUsersJoinedViaLink` = `app_link`. The admin page derives guest → account conversion as
  `guestsLinked / guestMembers` and shows `—` when there are no guests.
- **Provenance is recorded only from 2026-10-09** and was not backfilled: older members count in
  `membersTotal` but in no provenance figure, so conversion and the guest series understate anything
  before that date.
- The daily series (`groupsCreated`, `guestsJoined`, `guestsLinked`) is bucketed by UTC day.

## Short link on the apex (ABA-649, built, not yet activated)

`https://ai-budget.pl/g/<token>` is an nginx **302 redirect** (not a proxy) to
`https://api.ai-budget.pl/g/<token>`: a proxy would move the page to a new origin and drop every
existing guest's host-only cookie. It matches only `^/g/[A-Za-z0-9_-]{8,128}/?$`, carries just the
token (no open redirect), 404s everything else under `/g/`, and sets `Referrer-Policy: same-origin`
and `Cache-Control: no-store`. The API side is `GROUP_SHARE_BASE_URL`, read only by
`GroupsService.buildGuestUrl`; unset keeps today's links (`APP_PUBLIC_URL`, else the API host), and
`APP_PUBLIC_URL` (which builds `s/` and `sl/` and the origin check) is never changed for it. Snippet
`docker/nginx/apex-group-short-link.conf`; apply/verify/rollback in `docs/ops/group-short-link.md`.
**Not yet activated:** the nginx block must go live and be verified before the env is set, or new
links 404.

## Offline write gating (ABA-648)

Groups are online-only, so the group screens disable every server write while the API is
unreachable, with a `GroupOfflineBanner` as the explanation; reads are never blocked.

The signal is app-wide and pure JS (no NetInfo/`expo-network`: their native codegen is the Windows
MAX_PATH risk that removed `react-native-keyboard-controller`). It lives in
`apps/mobile/src/services/connectivity.ts` (zustand store `online | offline | unknown`) over the
pure state machine `connectivityCore.ts`, read through `src/hooks/useConnectivity.ts`
(`{isOffline}`; `unknown` counts as online). `http-client.ts`'s single `fetch` reports into it: any
HTTP response means online, a rejected fetch is only an offline CANDIDATE, confirmed by a probe of
public `GET /health`. That probe matters on web, where an nginx 429 without CORS headers is also a
`TypeError` (`docs/ops/api-rate-limit.md`). While offline it re-probes with backoff 5 s to 60 s, and
on `AppState` active (native) or the window `online`/`offline` events
(`connectivityListeners.web.ts`; `navigator.onLine` is only a hint).

Gating is the `write` prop on `GroupButton` (disabled plus an accessibility hint), plus the desktop
toolbar `Pressable`s, the Settle button and the Void action. Other server-only stores (receipt
split, trips) can adopt the hook later. A failed request while offline stays `console.warn`.

## Known gaps

- **Line claims (ABA-655), server side**: the migration `20261016000000_group_expense_items` and the guest form are
  unverified against real Postgres and in a browser (mocked Prisma and server-rendered-HTML tests only); the
  concurrent-claim serialisation relies on the row lock and is not exercised by a test against a real database.
  A removed member's claims stay as stored: a later re-derivation may move their (settled) share and leave a
  small stray balance on a removed row, which `computeGroupLedger` keeps rather than drops. The group-delete
  cascade now also runs through `group_item_claims.member_id` (`NO ACTION`), the same unverified class as the
  shares.
- **ABA-656 UI is unverified on a device and in a desktop browser**: the itemise switch, the line editor, the
  scan prefill, the claims screen and dialog, the row badge and the settle note have only pure-helper tests
  (nothing renders in CI). The "your part" preview of an unsaved draft mirrors the server's rounding only
  approximately (each line rounded for display; the total floors once, as the server does). The managers' editor
  lists live members only. `GroupExpense` carries no line count, so rows cannot say "N lines" without an API change.
- **The group currency itself** is still changeable only while the group has no expenses (unchanged by
  ABA-654: changing it would need every stored conversion re-based).
- **ABA-654 is unverified on a device, in a desktop browser and against real Postgres**: the currency
  chip, the rate row, the two-figure rows and the guest `<select>` have only pure-helper and
  server-rendered-HTML tests (nothing renders in CI), and the migration has not run here. The rate is the
  provider's at entry time (no history), not at the expense date; and the guest's post-add flash names the
  group currency but not the two figures (the redirect carries only a flash code), which the history row
  then shows.
- **"Count my share in my budget"** — the consumption mirror (phase-2 tasks H2/H3) is not built.
  Only H1 has landed: `Income.isSplitReceivable` and its exclusion from income totals (ABA-659),
  which nothing sets yet. The migration has not run against a real Postgres here.
- **Desktop, unverified in a browser:** whether the group expense dialog's "Take a photo" path
  degrades to a file picker on a desktop browser, and whether the Stack header duplicates the in-page
  title on `/groups` and `/groups/:id`.
- **`DELETE /groups/:id` with ledger data is unverified against real Postgres.** It is a hard
  delete that cascades from the group, while the member FKs on expenses, shares and settlements are
  `NO ACTION`; the specs mock Prisma, so whether the cascade order succeeds on a group with history
  has not been exercised. The same holds for ABA-650's owner `SetNull` backstop and the migration's
  data step: both are written, neither has run against a real database here (no local Postgres).
- **ABA-650 UI is unverified on a device and in a desktop browser**: the Make owner button, the orphan
  banner and the event rows have only pure-helper tests (nothing renders in CI).
- **ABA-651 UI is unverified on a device and in a desktop browser**: the reset button and its confirm
  have only pure-helper tests (nothing renders in CI).
- **ABA-652 UI is unverified on a device and in a desktop browser**: the amount field, the
  counterpart picker, the Record a payment buttons and the guest page's amount input have only
  pure-helper and server-rendered-HTML tests (nothing renders in CI).
- **ABA-658 (bots) is unverified against the live Telegram, WhatsApp and Slack APIs**: the handlers ran
  only against mocked clients and an in-memory stand-in for `GroupsService` (whose dedup and FX refusal it
  mirrors), so the inline keyboard, the WhatsApp list and the Slack `static_select` have not been tapped on
  a real device, and the bot write has not run against real Postgres. Payer and split are fixed (me, equal).
- **ABA-657 (merge) is unverified against real Postgres, on a device and in a desktop browser**: the transaction
  ran only over an in-memory Prisma (with rollback) in `group-merge.service.spec.ts`, the migration has not run
  here, and the "Merge with…" picker, its confirm and the link screen's merge offer have only pure-helper tests.
  An itemised expense's stored shares and its converted claims can disagree by a cent until the next claim
  change re-derives them (the merge sums share rows on purpose, see above). There is no push to the survivor
  and no "reverse a merge" (out of scope in the spec).
- **Balance reminders (ABA-653):** the windows are on the server clock (UTC days), not
  `user.timezone`, and there is no per-group mute (both follow-ups in the phase-2 spec). The settings
  toggle is unverified on a device and in a desktop browser (nothing renders in CI), the migration has
  not run against a real Postgres here, and the cron's per-group `loadState` is fine at today's
  volume but would want a "skip groups whose `ledgerVersion` did not change" shortcut if group counts
  grow.
- **Repo-wide: there is no global throttler.** No `APP_GUARD` registers `ThrottlerGuard`, so the
  `ThrottlerModule` default in `apps/api/src/app.module.ts` applies nowhere and a bare `@Throttle`
  is inert; only routes that add `@UseGuards(ThrottlerGuard)` are rate-limited (the groups module
  does so per route). Every other route, the group app routes included, has only the nginx proxy
  limit (`docs/ops/api-rate-limit.md`).

## History

- [ABA-640](https://github.com/micode-ai/ai-budget-assistant/issues/670) — the feature, in one
  build: tables, pure ledger, app routes, guest page, link codes, mobile screens. A security audit
  before merge replaced the `GET /g/:token/me/:secret` restore link with a POST restore code, added
  the per-member and per-join write ceilings and the Origin / `Sec-Fetch-Site` check on join and
  restore, added `removedByOwner`, and switched the member FKs to `NO ACTION`.
- [ABA-650](https://github.com/micode-ai/ai-budget-assistant/issues/680) — ownership transfer,
  succession when the owner's account ends (soft or hard), orphan groups and their adoption, the
  `GroupMemberEvent` log shown as activity rows (app: every kind; guest page: merges only), the owner
  FK switched from `Cascade` to `SetNull`, and "Former member" on a hard delete.
- [ABA-651](https://github.com/micode-ai/ai-budget-assistant/issues/681) — the owner resets one guest's
  browser claim (`claim_reset` event, app only), and link codes are bound to the minting claim so a
  reset device's outstanding code dies with it.
- [ABA-652](https://github.com/micode-ai/ai-budget-assistant/issues/682) — partial and custom
  settlement amounts: `validateSettlement` against current balances (shrink-only, clamped, 400
  `SETTLEMENT_EXCEEDS_BALANCE`) replaced `isValidSettlement`; an editable amount on the app's
  settle screen and dialog, *Record a payment* with a counterpart picker, and a visible amount
  field on the guest settle form.
- [ABA-654](https://github.com/micode-ai/ai-budget-assistant/issues/684) — expenses in other currencies,
  converted once at write time into the group currency (original amount, currency, rate, source and time
  stored; no read-time conversion), the edit rule, `FX_RATE_UNAVAILABLE`, `GET /groups/:id/fx-preview`,
  a currency chip and rate row in the app's expense form (phone and desktop dialog), two-figure activity
  rows, and a currency select on the guest page.
- [ABA-655](https://github.com/micode-ai/ai-budget-assistant/issues/685) — line items and claims on group
  expenses, server and guest page: `GroupExpenseItem` + `GroupItemClaim`, receipt-split's calculator with the
  payer as a participant, shares materialised inside the ledger transaction, the 7-day lock rule (then payer,
  creator or owner; close/reopen), settlements never touched, `hasOpenItemClaims`, the app routes, and a no-JS
  guest claim form.
- [ABA-656](https://github.com/micode-ai/ai-budget-assistant/issues/686) — the app UI for line items and claims,
  phone and desktop: the itemise switch and line editor in the expense form (typed or prefilled from the scan),
  `GroupClaimsView` (my lines with a preview; everyone, percentages, close/reopen for the payer, creator and owner)
  on its own route and in a desktop dialog, the itemised row badge, and the open-claims note on the settle surfaces.
- [ABA-657](https://github.com/micode-ai/ai-budget-assistant/issues/687) — merging two members without
  changing anyone's balance: owner merges, absorbing an unclaimed name, the link-code self-merge after
  ALREADY_MEMBER, one transaction with an in-transaction balance assertion, `mergedIntoMemberId`, the
  `member_merged` event, "Merge with…" in the member sheet (phone and desktop) and the link screen's offer.
- [ABA-658](https://github.com/micode-ai/ai-budget-assistant/issues/688) — adding an expense to a group from
  Telegram, WhatsApp and Slack: `group <amount> [currency] [description]`, a picker of up to 10 groups, a
  confirm card, `GroupBotService` over `GroupsService.createExpense`, membership re-resolved at confirm, the
  account viewer role deliberately not applied, drafts in `CacheService`, the message id as the request id.
- [ABA-659](https://github.com/micode-ai/ai-budget-assistant/issues/689) — phase-2 task H1:
  `Income.isSplitReceivable` (server, SQLite, pull mapping, backup restore) and its exclusion from every
  income total on the server and the device, behaviour-neutral until the budget mirror sets it.
- [ABA-653](https://github.com/micode-ai/ai-budget-assistant/issues/683) — weekly balance reminder
  pushes to app-user debtors and creditors (`GroupReminderCron`, 17:00 UTC; episode columns on the
  member row; at most 4 per open balance, one per user per day), `User.notifyGroupReminders` and its
  settings toggle, and the push opening the settle screen.
