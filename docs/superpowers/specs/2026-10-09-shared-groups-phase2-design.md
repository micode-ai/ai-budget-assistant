# Shared expense groups, phase 2 — Design

Builds on `docs/superpowers/specs/2026-10-08-shared-groups-design.md` (MVP, ABA-640),
`docs/superpowers/specs/2026-10-09-desktop-groups-receipts-report-design.md` (ABA-646) and
`docs/wiki/features/shared-groups.md`. Where those and the code differ, the code is right.

## Goal

Close every phase-2 item from the MVP spec: reminders, ownership, per-member claim reset, merging
members, partial settlements, multi-currency, line-item claims, "count my share in my budget", bot
entry, offline gating, and the apex short link. Each item is decided here, then cut into
shippable tasks (one issue, one commit each).

## Locked decisions

Carried from the MVP spec, still binding:
1. Groups stay a **standalone model**, not account-scoped. `AccountContextGuard`/`ViewerBlockGuard`
   never run on group routes; `GroupMemberGuard` (404 to non-members) replaces them. This applies to
   bots too (item I).
2. A member is a row; every payer, share, claim and settlement references a **member id**.
3. Every incoming member/expense/settlement/item id is re-scoped `{id, groupId}` (members also
   `removedAt: null`) before use. The guest actor comes **only** from the hashed cookie secret.
4. Every ledger write bumps `ledgerVersion` inside its `$transaction`; settlements are a CAS on it.
5. Guest page: no `<script>`, PRG (every POST answers 303), per-member CSRF on cookie forms,
   `Sec-Fetch-Site` first then `Origin` on the cookie-minting POSTs, `Referrer-Policy: same-origin`
   (**never** `no-referrer`), byte-identical not-found, write ceilings charged after actor + CSRF and
   failing closed.
6. **No `APP_GUARD` exists**: a route is rate-limited only if it adds `@UseGuards(ThrottlerGuard)`.
   Every new guest route adds it; a bare `@Throttle` is inert.
7. Each `schema.prisma` change ships with its migration in the **same commit** (ABA-558). New
   migration names below are patterns; the timestamp is the commit date and must sort after
   `20261012000000_group_member_join_provenance`.
8. **Every screen ships phone and desktop (>= 1024) in the same task** (user rule). Desktop follows
   the ABA-646 pattern: hosted views take optional callbacks defaulting to the router call; overlay
   state lives in `GroupDetailDesktop`/`GroupsDesktop`, `*Dialogs.tsx` only render it; a new dialog
   opens from a deep link via `initialDialog`. Desktop work goes `aba-web-designer` ->
   `aba-web-engineer`, following `docs/contracts/desktop-web-design-language.md`.
9. Free on every tier (MVP locked decision 9) unless the user decides otherwise (see "Decisions
   that are the user's").

## What the code says that changes the plan

- **Self-service account deletion is soft.** `DELETE /users/me` -> `UsersService.deactivate` sets
  `isActive: false`; nothing cascades. Only the admin hard delete (`AdminService.deleteUser` ->
  `prisma.user.delete`) cascades the group away through `ExpenseGroup.owner onDelete: Cascade`. So
  item B has two failure modes: the common one is a **headless group** (the owner is deactivated, so
  nobody can rotate, archive, reset or remove anyone), and the rare one is the cascade.
- **`APP_PUBLIC_URL` drives three guest surfaces** (`s/`, `sl/`, `g/`) and `isTrustedRequestOrigin`.
  Item K must not touch it.
- **No connectivity module is installed** (no `@react-native-community/netinfo`, no `expo-network`).
  `services/http-client.ts` has one `fetch` site with one `catch`, which is the natural signal.
- **Receipt-split's accounting does not give "my share" in budgets.** Its own spec keeps the full
  200 in Restaurants (only receivables are excluded; the repayment income nets cash flow). It also
  has per-counterparty receivables, which `simplifyDebts` netting makes meaningless for a group (Ann
  may pay off Bo's part). See item H.
- `Income` has no `isSplitReceivable` column; `EXCLUDE_SPLIT_RECEIVABLE` is Expense-only.
- `ShareType` is shared with trips (`TripExpenseShare`); adding an `items` value would leak into the
  trip code. Item G uses a boolean instead.
- `extractGroupToken` is host-agnostic, so a pasted apex link already parses (item K).

---

## A. Balance reminder pushes

**Decision.** A daily cron reminds **app-user** members of an open balance that has kept the same
sign for 7+ days: debtors get "You owe 42,00 PLN in Flat", creditors get "Flat: you are owed
54,00 PLN". The creditor push is the more valuable half: most debtors are guests with no push, so the
app user who is owed is the one who chases them (and it is what the guest-page CTA "Get a reminder
when someone owes you" already promises).

- **Cadence.** First push 7 days after the balance opened, then every 7 days, at most 4 per
  episode. An episode ends when |balance| < 1.00 in group currency or the sign flips (new episode).
  At most **one reminder push per user per run** (the group with the largest |balance|); the others
  stay eligible and go out on later days. Archived groups, inactive users and guests are skipped.
- **Clock.** Episode tracking is cron-maintained, daily granularity, server clock (same known gap as
  debt reminders). No write-path hook, so no ledger write gets slower.
- **Opt-out.** New `User.notifyGroupReminders` (default `true`), separate from
  `notifyGroupActivity`: they are different questions ("tell me what changed" vs "nag me about
  money"). Exposed as `groupReminders` on `GET/PATCH /users/me/notification-preferences`; enforced in
  `NotificationsService.sendToUser` for the new type `group_reminder` (both gate blocks).
- **Copy.** Owe and owed bodies must differ in every locale; extend `notification-i18n.spec.ts`
  the way ABA-628 did for debts.

Schema (migration `<ts>_group_balance_reminders`):
- `User.notifyGroupReminders Boolean @default(true) @map("notify_group_reminders")`
- `ExpenseGroupMember`: `balanceOpenSince DateTime?`, `balanceOpenSign Int?` (-1 / 1),
  `lastReminderAt DateTime?`, `reminderCount Int @default(0)`. No backfill: a NULL with an open
  balance starts the clock on the first run.

Server: `modules/groups/group-reminder.cron.ts`, `@Cron('0 17 * * *')`, streams active groups that
have at least one app-user member through `paginateById`, calls `GroupsService.loadState`, updates
episode columns, sends via `logFireAndForget`. Push data `{groupId, reminder: 'owe'|'owed'}`, opens
`/groups/:id` (`notifications.ts` route map gains the type).

UI: notification settings toggle in `NotificationsSettings.tsx`, which is both the phone screen and
the desktop settings pane (one component, verify both). i18n: mobile 2 keys, push 4 keys, x 9.

Tests: episode state machine (pure `nextReminderState(prev, balance, now)`), one-push-per-user
selection, max 4, archived/guest/inactive skipped, pref gate, owe != owed per locale.

## B. Ownership transfer and owner departure

**Decision.** Explicit transfer to any live app-user member, plus **automatic succession** when the
owner leaves the platform, plus an **orphan** state when nobody qualifies. The group never cascades
away with its owner.

- **Manual transfer** `POST /groups/:groupId/owner {memberId}`: target is a live member with
  `userId` whose user `isActive`, not self; 409 `OWNER_LIMIT` if the target already owns 20 active
  groups. One `$transaction`: `updateMany where {id, ownerUserId: <current>}` (CAS against a
  concurrent transfer; count 0 -> 409 `OWNER_CHANGED`), event row, then push to the new owner.
  Afterwards the former owner may leave (the zero-balance rule still applies).
- **Departure** `GroupsService.handleOwnerDeparture(userId)`, called from `UsersService.deactivate`
  and from `AdminService.deleteUser` **before** the delete: for each owned group, successor = the
  earliest-joined live member with an active user; none -> `ownerUserId = null` (orphan).
- **Backstop FK.** `ownerUserId` becomes nullable with `onDelete: SetNull`, so a path that forgets
  the hook orphans instead of cascading.
- **Orphan adoption.** `join`, `linkGuest` and app-side `createMember` with a `userId` set the owner
  atomically (`updateMany where ownerUserId: null`) when the group is ownerless. Orphans stay fully
  usable by members and guests; only owner actions are unavailable until then.
- **Already-headless groups.** The migration's data step assigns, for every group whose owner is
  inactive, the earliest-joined active app-user member, else NULL.
- **Event log** (shared with C and D): new `GroupMemberEvent` rows, shown as system rows in the
  activity feed.

Schema (migration `<ts>_group_ownership_transfer`):
- `ExpenseGroup.ownerUserId String?`, relation `onDelete: SetNull` (drop NOT NULL, recreate FK).
- `enum GroupMemberEventKind { owner_transferred member_merged claim_reset }`
- `model GroupMemberEvent { id, groupId (FK cascade), kind, actorMemberId String?,
  subjectMemberId String, targetMemberId String?, subjectName String (snapshot), createdAt }`.
  Member columns are plain ids with no FK, so a merge never has to re-point audit rows.

API: `GroupDetail.ownerMemberId` becomes nullable-aware (`isOwner` false for everyone when
orphaned); `GroupActivityItem` gains `{kind: 'event'; at; event: GroupMemberEventView}`.
`getActivity` merges the three sources by `at`. `GroupOwnerGuard` with a null owner -> 403.

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| POST | `/groups/:groupId/owner` | `JwtAuthGuard + GroupMemberGuard + GroupOwnerGuard + GroupActiveGuard` | `{memberId}` | `GroupDetail` / 409 `OWNER_LIMIT` / 409 `OWNER_CHANGED` |

Guest page: renders `member_merged` events only. `owner_transferred` and `claim_reset` would
reveal that a member is an app user or was reset, which the page must never show.

UI: `GroupMemberSheet` (owner viewing an app-user member) gains "Make owner" + `showAlert` confirm;
`GroupOwnerControls` shows "Transfer ownership to leave" in place of the leave action for the owner;
an orphaned group shows an info banner in `GroupDetailView` and in `GroupDetailDesktop`. Event rows
render in `GroupActivityList` (phone) and in `GroupActivityTable` via `groupActivityTable.ts`
(desktop: no subtotal, not focusable as an editable row, skipped by `Enter`). i18n about 10 mobile, 2 push,
1 guest x 9.

Tests: CAS race, `OWNER_LIMIT`, departure picks the earliest active app user, orphan on none,
adoption on join and link, hard delete with the hook and without it (FK backstop, against **real
Postgres**, which also closes the "DELETE with ledger data is unverified" known gap), guest page
never renders the two private event kinds.

## C. Per-member claim reset

**Decision.** The owner resets **one** guest's browser claim: `claimTokenHash` and `claimedAt` go
NULL, the device's cookie stops resolving, and the name shows up on the picker again. No token
rotation, nobody else is affected. It is the remedy for "Ania cleared her cookies and lost the
restore code" and for "someone else claimed Ania's name".

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| POST | `/groups/:groupId/members/:memberId/reset-claim` | `JwtAuthGuard + GroupMemberGuard + GroupOwnerGuard + GroupActiveGuard` | — | `GroupMember` / 404 (foreign, removed, app user) / 409 `NOT_CLAIMED` |

App users are refused because they have no claim that matters: their identity is the JWT. Writes a
`claim_reset` event. There is no guest-page change (the existing picker lists the row again).

UI: `GroupMemberSheet`, owner viewing a claimed guest: "Reset browser sign-in" with confirm copy
("They will pick their name again from the link. Anyone holding their old device loses access.").
The same component serves the phone and the desktop members dialog. i18n about 4 x 9.

Threat: the owner can hand a guest's name to someone else. That is not a new power, since the owner
can already edit or delete every expense; the event row keeps it visible.

Tests: only the target row changes, the old cookie no longer identifies (`identify` returns null),
the name becomes claimable, app-user/unclaimed/foreign refused, non-owner 403.

## D. Merge two members

**Decision.** Merge is a re-pointing transaction that preserves the **pair's combined balance**
and **every other member's balance**, records a `member_merged` event, and soft-removes the
absorbed row with `mergedIntoMemberId`. It is irreversible (confirm copy says so).

**Who may merge.** Merging moves money between identities, so whoever ends up holding the merged
balance must consent:
- **Self-merge via link code** (the common case: "I'm Ania (guest) in the browser and Ania in the
  app"): `POST /groups/link-guest {code, merge: true}` after the 409 `ALREADY_MEMBER`. Holding the
  code proves the guest cookie, and the JWT proves the app row. `from` = the guest row, `into` = the
  caller's row.
- **Owner merge** `POST /groups/:groupId/members/:memberId/merge {intoMemberId}`: allowed when
  `into` is a guest row or the owner's own row ("Ania" and "Ania (2)" after a lost cookie).
- **App user absorbs an UNCLAIMED guest row** into their own row (same route, not owner-only):
  this is no more power than claiming a placeholder at join time, which anyone with the link has.
- Never two app-user rows (409 `BOTH_APP_USERS`). If an owner merge names an app-user `from` and a
  guest `into`, the service swaps them so the app-user row survives.

**Algorithm** (`group-merge.ts` pure planner + one `$transaction`, which first bumps `ledgerVersion`
as the lock):
1. Re-scope both ids (live, same group, distinct). Snapshot balances.
2. **Shares**: where both rows have a share on one expense, sum into `into` (`shareAmount` summed;
   `shareValue` summed for exact/percentage/shares, NULL for equal) and delete the `from` row
   (`@@unique([groupExpenseId, memberId])`). Otherwise re-point `memberId`.
3. **Claims (after G)**: before re-pointing, convert every line claimed by `from` **and** by anyone
   else to explicit `shareBp` at its current fractions. Otherwise an equal line divided three ways
   becomes divided two ways and a third person's share changes. Then sum `from` + `into` bp onto one
   claim (cap 10000) and re-derive the shares.
4. Expenses `paidBy`/`createdBy`/`deletedBy`, settlements `from`/`to`/`recordedBy`/`voidedBy` ->
   `into`. A settlement that becomes `into -> into` is **voided** (`voidedByMemberId` = actor). Its
   effect on the pair summed to zero, so voiding preserves the combined balance.
5. `from`: `removedAt = now`, `claimTokenHash = null`, `mergedIntoMemberId = into`.
6. Assert inside the transaction: the `into` balance equals the old pair sum and every other member
   moved by less than 0.01. If not, roll back with 500 and log it (it is a bug, not user input).
7. After commit: H mirror re-sync for the affected expenses (fire-and-forget).

History stays readable: re-pointed rows show the survivor's name, and the event row "Ania (guest)
was merged into Ania" (subject name snapshotted) explains it, on the app and on the guest page.

Schema (migration `<ts>_group_member_merge`): `ExpenseGroupMember.mergedIntoMemberId String?`
(no FK). The `nameKey` of the absorbed row stays reserved (removed rows keep their names, as today).

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| POST | `/groups/:groupId/members/:memberId/merge` | `JwtAuthGuard + GroupMemberGuard + GroupActiveGuard` (consent rules in the service) | `{intoMemberId}` | `GroupDetail` / 403 / 409 `BOTH_APP_USERS` |
| POST | `/groups/link-guest` (extended) | unchanged (`ThrottlerGuard` 10/min) | `{code, merge?: true}` | `GroupDetail` |

For `link-guest` with `merge: true`, the code is consumed with the same GETDEL, the same
rotation/guest-access/archive re-read, and the caller's row must be live.

UI: `GroupMemberSheet` "Merge into..." -> member picker -> confirm showing the resulting combined
balance (client-side sum, labelled as a preview); `GroupLinkView`'s already-member state gets
"Merge 'Ania' into your account". Both components serve phone and desktop (the link view is the
same centred transient screen on both). i18n about 10 mobile, 1 guest x 9.

Tests: balance-preservation property test over random ledgers (pair sum kept, others within 0.01),
overlapping shares per split type, the claim conversion case, self-settlement voided, consent matrix,
self-merge with a rotated link -> 410, merged row excluded from pickers, event on the guest page.

## E. Partial and custom settlement amounts

**Decision.** Validate a settlement against **current balances**, not against the suggested
transfers. Pure `validateSettlement(proposed, balances)` replaces `isValidSettlement`:
- `from != to`, the actor is `from` or `to` (unchanged), `amount >= 0.01`;
- `balance[from] <= -0.005` (a debtor) and `balance[to] >= 0.005` (a creditor);
- `amount <= min(-balance[from], balance[to]) + 0.01`, stored clamped to that minimum.

Every suggested transfer passes (simplifyDebts never exceeds either side), so nothing that works
today breaks. Forgery protection is kept: a payment can only **shrink** both balances toward zero,
and never flips a sign, so nobody can record "I paid 1000" to become a creditor. The CAS on
`ledgerVersion` and void-by-receiver are unchanged. A debtor may also pay a creditor who is not the
suggested one (both balances still shrink).

No schema change. API: `CreateGroupSettlementDto` is unchanged in shape; the error code becomes
`SETTLEMENT_EXCEEDS_BALANCE` (keep `SETTLEMENT_MISMATCH` as an alias for older app builds if the
store branches on it).

Guest page: the settle form's hidden `amount` becomes a visible text input prefilled with the
suggested amount, plus a hint "You can pay part of it"; new flash `toomuch`. Still no JS, CSRF,
`rid`, `v`.

UI: `GroupSettleView` gets an editable amount (default = suggested, client mirror
`maxSettleAmount` in `features/groups/groupMath.ts`) and a creditor picker when opened as "Record
a payment" (phone: a button in `GroupDetailView`'s button row; desktop: a toolbar button in
`GroupDetailDesktop`, which opens `GroupSettleDialog`). i18n about 6 mobile, 3 guest x 9.

Tests: the rule table (partial, exact, over by 0.02, non-debtor from, non-creditor to,
non-suggested creditor), clamp, CAS still 409, guest flash.

## F. Multi-currency per group

**Decision.** The group currency remains **the ledger currency**. An expense entered in another
currency is converted **once, at write time**, and both figures are stored. Nothing converts at
read time, so a settled ledger never drifts. Settlements stay in group currency.

- Rate: `ExchangeRateService` (the existing singleton) through `common/utils/fx.ts`, with
  `base = group currency`: `amount = round2(originalAmount / rates[originalCurrency])`. The rate is
  the **rate at entry time** (the provider has no history); the app lets the user override it
  (`fxRateSource: 'manual'`). An unknown rate with no override -> 400 `FX_RATE_UNAVAILABLE`, never a
  silent unconverted amount (the display-currency invariant).
- **Edits**: changing `originalAmount` reuses the stored rate, changing the currency fetches a new
  one (or takes the override), and editing anything else touches no figures. No "refresh rate" job,
  ever.
- **Exact/percentage/shares with a foreign currency**: the user enters values in the original
  currency, and they are applied as **weights** to the converted amount (`resolveShares(amount,
  'shares', values)`), so the shares sum exactly to the stored group amount, with the residual cent
  on the last member as today.
- The group currency lock ("changeable only with no expenses") is unchanged.

Schema (migration `<ts>_group_expense_fx`), all nullable, NULL meaning "entered in group currency"
(no backfill): `GroupExpense.originalAmount Decimal(12,2)?`, `originalCurrency String?`,
`fxRate Decimal(18,8)?`, `fxRateSource String?` (`provider`|`manual`), `fxRateAt DateTime?`.

API: `CreateGroupExpenseDto`/`UpdateGroupExpenseDto` gain `currencyCode?` (default the group's) and
`fxRate?`; `GroupExpense` gains the five fields; `GET /groups/:groupId/fx-preview?currency=` (member
guard) returns the provider rate for the form.

Guest page: a currency `<select>` (group currency first, then the app's currency-picker list) on the
add form. No JS means no live preview, so the server converts and the post-redirect flash says
"Added 100,00 EUR = 428,50 PLN". A guest can delete their own expense if the rate surprised them.
Activity rows show `100,00 EUR -> 428,50 PLN` on both surfaces.

UI: `GroupExpenseForm` currency chip beside the amount + an editable rate row when foreign (one
form, hosted by the desktop dialog). Phone activity row and desktop table amount cell show the
original as a secondary line. i18n about 6 mobile, 4 guest x 9.

Tests: conversion formula, unknown rate refused, edit reuses the rate, weights sum exactly, a
balance is identical before/after a simulated rate change (the no-drift test), guest select
re-scoped to the allowed list.

## G. Line-item claims on group expenses

**Decision: claims are open for a window, then frozen; settlements are never re-validated or
voided by a claim change.**

The math is receipt-split's, unchanged: `resolveItemSplit(items, assignments, billTotal,
discountAmount)` with **every member who claims as a participant, the payer included**. The
payer's share = their own claims + `ownShare` (unclaimed lines, rounding, and anything that is not a
line, such as a deposit), which is the "whatever is left belongs to the payer" convention. Per-line
`shareBp`, per-line discounts and basket-discount scaling all come for free. `allocateItemShares`
renders "your part of each line". The resolved per-member amounts are **materialised** as ordinary
`GroupExpenseShare` rows, so `loadState`, balances, reminders and the mirror never learn about
items.

**The lock rule.**
- An itemised expense has `claimsOpenUntil` = creation + 7 days. While open, **any live member
  toggles their own claims** (app or guest page). Each change recomputes and rewrites the shares
  (delete + recreate, the trip invariant) and bumps `ledgerVersion`, in a transaction that first
  takes the expense row's lock (a no-op update, the `withMemberSlot` pattern), so two concurrent
  claimers serialise.
- After the window, or after the payer/creator/owner taps "Close claims", self-claims are refused
  (409 `CLAIMS_CLOSED`, guest flash `claimsclosed`). The **payer, creator and owner** can still
  edit anyone's claims and bp at any time, or reopen the window for another 7 days. That is exactly
  the authority they already have to edit any expense's shares today.
- Archiving the group freezes everything (it is read-only already).

**Why this rule and not receipt-split's.** Receipt-split locks the whole split once anyone has
claimed or settled. On an ongoing ledger that lock would fire almost immediately: settlements are
not tied to expenses (they net across all of them), so "anyone settled" is true most of the time,
and guests visit sporadically, so most people would not have claimed yet. The alternative, "never
lock", lets a late visitor reshape co-claimants' shares months later. The window gives a predictable
period in which the bill is being divided, after which it is as stable as any other expense.
Settlements are left alone because they are **money that actually moved**. The MVP already decided
this for expense edits ("the old settlement stays valid, it is just money moved"), and a claim change
is an expense edit. A shift after someone settled simply reopens a small balance, which the
suggested transfers then show. To make that visible rather than surprising:
- the claim change goes through the normal `group_activity` push (coalesced) to app users whose
  share moved;
- while any itemised expense is open, the settle surfaces (app settle view, guest settle form) show
  "Some receipts are still being divided, so amounts may still change".

**Who creates itemised expenses.** The app only, from a scanned receipt (`POST /ai/scan-receipt`
already returns lines) or typed lines, with at most 100 lines. Guests claim but do not create
itemised expenses: a no-JS multi-line editor is poor, and the existing "the app reads paper receipts"
CTA is the natural hook. F applies: line prices are in the original currency, the split is computed
there, and the per-member results are converted with the payer last as the residual (weights method
from F).

**The guest claim form (no JS).** Per open itemised expense (the page shows at most the 5 most
recent open ones, collapsed in `<details>`): one row per line with name, price, claimant count and
"your part", a checkbox `c_<itemId>`, and a hidden `l_<itemId>=1` for **every rendered line**, so the
server can tell "unchecked" from "not shown". `POST /g/:token/expenses/:expenseId/claims`: the server
intersects the `l_` keys with the expense's real items (re-scoped to the expense and the group, so a
foreign id is ignored), sets the actor's claims on exactly those lines, and leaves explicit bp
untouched. It answers 303 with flash `claimed`. Guests toggle equal claims only (no bp entry). The
form uses the full guarded pipeline: cookie actor, CSRF, write ceiling, archived refusal, `ThrottlerGuard`.

Schema (migration `<ts>_group_expense_items`):
- `GroupExpense.itemized Boolean @default(false)`, `discountAmount Decimal(12,2)?`,
  `claimsOpenUntil DateTime?`. Itemised rows store `splitType = exact` with resolved amounts, so the
  trip `ShareType` enum is untouched.
- `GroupExpenseItem { id, groupExpenseId (FK cascade), name (<=120), totalPrice Decimal(12,2),
  lineDiscount Decimal(12,2)?, position Int, createdAt }`, `@@index([groupExpenseId])`.
- `GroupItemClaim { id, itemId (FK cascade), memberId (FK NoAction), shareBp Int?, createdAt }`,
  `@@unique([itemId, memberId])`, `@@index([memberId])`.

API:

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| POST | `/groups/:groupId/expenses` (extended) | unchanged | `+ items?: {name, totalPrice, lineDiscount?}[], discountAmount?` (presence => itemised) | `GroupDetail` |
| GET | `/groups/:groupId/expenses/:expenseId/items` | `JwtAuthGuard + GroupMemberGuard` | — | `GroupExpenseItemsView` (lines, claims by member, my parts, `claimsOpenUntil`) |
| PUT | `/groups/:groupId/expenses/:expenseId/claims/me` | `+ GroupActiveGuard` | `{itemIds: string[]}` | `GroupExpenseItemsView` / 409 `CLAIMS_CLOSED` |
| PUT | `/groups/:groupId/expenses/:expenseId/claims` | `+ GroupActiveGuard` (creator/payer/owner in service) | `{claims: {memberId, itemIds, shareBp?}[]}` | same |
| POST | `/groups/:groupId/expenses/:expenseId/claims/close` | `+ GroupActiveGuard` (creator/payer/owner) | `{reopen?: boolean}` | same |
| POST | `/g/:token/expenses/:expenseId/claims` | `ThrottlerGuard` 10/min + guest pipeline | form | 303 |

Share validation lives in the service (bp 0..10000, whole numbers, at most 10000 per line, the
claimant must hold a claim), as in receipt-split. Stale claims are pruned **in storage** when an
edit removes a line, and an explicit zero is kept.

UI:
- `GroupExpenseForm`: an "Itemise" toggle after a scan or typed lines (an items editor component
  under `components/groups/`). On desktop it is hosted in `GroupExpenseDialog`, unchanged.
- New `GroupClaimsView` (claim my lines; for the payer/creator/owner, also assign people and edit
  bp, reusing `components/split/itemShares.ts`/`itemAssignments.ts` and `LineShareEditor` where they
  fit): phone route `app/groups/[id]/claims.tsx` (`?expenseId=`), with a header; desktop
  `desktop/GroupClaimsDialog.tsx` opened from the activity row and through
  `initialDialog="claims"` for deep links.
- Activity: an "Open, ends 16 Oct" badge on itemised rows (phone list and desktop table).
i18n: about 25 mobile, about 12 guest x 9.

Tests: math parity with receipt-split for the same input (payer-as-participant mapping), payer
remainder, discount scaling, the window (open, closed, reopened, payer override), concurrent claim
serialisation, guest form unchecked vs not-shown, foreign `itemId` ignored, a claim change after a
settlement leaves the settlement intact and reopens the balance, conversion with the payer residual.

## H. "Count my share in my budget"

**Decision (pending the user's confirmation, see the last section): a per-membership opt-in
*consumption mirror*. It writes one ordinary personal `Expense` per group expense, for **my share**,
and excludes every *linked* group cash movement with the existing split-receivable predicate.**

Why not receipt-split accounting as is: it keeps the full outflow in budgets (its own documented
trade-off: 200 stays in Restaurants), so it does not deliver "my share in my budget". Its
per-counterparty receivables do not survive `simplifyDebts` netting either (a payment from Ann can
clear Bo's part, so no receivable can be closed honestly). Mixing the two models fails under
netting, because a debtor-side share row double-counts against a netted, smaller incoming transfer.
Only one of two pure models is coherent:
- **cash**: book only the captured money, so budgets show what you paid (the MVP today);
- **consumption**: book only shares, and exclude every group cash leg.

"Count my share" is, by definition, the consumption model.

**Rules.**
- Opt-in per group, on my own member row: target account (I must be a non-viewer member of it;
  `encryptionTier = 0`, because the server writes plaintext descriptions) and a default category.
  It applies to expenses dated from the start of the current month (no dumping history into closed
  budgets).
- **Share rows.** For each live group expense with my `shareAmount > 0`: one `Expense` with
  `source: 'group'`, `amount = my share`, the group currency, the expense date, description
  `"<group>: <description>"`, my default category (a category I change later is preserved),
  `groupExpenseId` + `groupMemberId` (`@@unique`). These are **ordinary counted rows**. Amount, date
  and currency are owned by the mirror (read-only in the app). Deleting one is respected as "don't
  count this one" and is not recreated.
- **Cash legs are linked, then excluded** via `isSplitReceivable` (its docstring meaning: the money
  is accounted for by another row): my captured card payment for a group expense I paid, my captured
  outgoing settlement transfer (Expense), and my captured incoming settlement transfer (Income,
  which needs the new `Income.isSplitReceivable`, task H1). **Never `isDebt`.** A row that is already
  `isDebt`, `isSplitReceivable`, `isPlanned` or carries a live receipt split cannot be linked.
- **Linking, two tiers** (the bank-notification precedent): an exact match (same target account,
  same currency (the original currency for F), equal amount, date within 3 days, unlinked, a single
  candidate) is **auto-linked** and shown as such (undoable); anything else is a **suggestion**. It
  is triggered from both directions: after a group expense/settlement write involving me, and after
  a personal Expense/Income create on any capture path (a branch in
  `ExpenseCreatedHooksService.onExpenseCreated`, the income equivalent, and a post-commit pass in
  bank/Wise import, since imports may bypass the hook, which the implementer must verify).
- **Turning it off** deletes the share rows and unlinks every leg in one transaction, so the books
  revert to the pure cash model with nothing half-applied.
- **Honest limit, written in the UI and user_docs:** a captured payment that is **not** linked is
  counted twice. A "may be counted twice" card lists unlinked legs and suggestions. This cannot be
  guaranteed by construction, because capture is a separate system.
- **Known trade-off:** while balances are open, the wallet balance differs from the bank by the
  open group balance (the share is booked, the cash leg is excluded). It converges to the bank when
  settled.

Reconciler `GroupBudgetMirrorService.reconcileExpense(groupExpenseId)` is idempotent and is called
post-commit (fire-and-forget, `logFireAndForget`) from every share-changing write: create, edit,
delete, claims, merge, F conversion edits. A daily sweep cron reconciles groups with mirror members
and catches lost calls.

Schema:
- H1 `<ts>_income_split_receivable`: `Income.isSplitReceivable Boolean @default(false)`.
  `EXCLUDE_SPLIT_RECEIVABLE` spread into **every income total** (23 files query incomes; the
  implementer greps and lists them in the commit), plus the mobile SQLite column, repository, sync
  payload and `filterConsumption` for incomes (receipt-split's propagation checklist). It is
  behaviour-neutral on its own (everything is false).
- H2 `<ts>_group_budget_mirror`: `ExpenseGroupMember.budgetMirrorFrom DateTime?`,
  `budgetAccountId String?` (FK SetNull), `budgetCategoryId String?` (FK SetNull);
  `Expense.groupExpenseId String?`, `Expense.groupMemberId String?`,
  `@@unique([groupExpenseId, groupMemberId])`; `GroupCashLink { id, memberId, kind (payer_expense |
  settlement_out | settlement_in), groupExpenseId?, settlementId?, expenseId?, incomeId?, origin
  (auto | user), createdAt }`. `ExpenseSource` gains `'group'` in `shared-types/entities/primitives.ts`.

API:

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| PUT | `/groups/:groupId/budget-mirror` | `JwtAuthGuard + GroupMemberGuard` + an account-membership check on `accountId` in the service (non-viewer, tier 0) | `{accountId, categoryId}` | `GroupBudgetMirrorView` |
| DELETE | `/groups/:groupId/budget-mirror` | `JwtAuthGuard + GroupMemberGuard` | — | `204` |
| GET | `/groups/:groupId/budget-links` | `JwtAuthGuard + GroupMemberGuard` | — | links, suggestions, unlinked legs |
| POST | `/groups/:groupId/budget-links` | same | `{kind, groupExpenseId? \| settlementId?, expenseId? \| incomeId?}` | view |
| DELETE | `/groups/:groupId/budget-links/:linkId` | same | — | view |

Every `expenseId`/`incomeId` is re-scoped to `{userId: me, accountId: budgetAccountId}`, and a
group id to the guard's group.

UI (H3): a "Count my share in my budget" section in `GroupMembersView`'s "my settings" (account +
category pickers, which already exist as components); the "may be counted twice" card (phone: a card
under the hero in `GroupDetailView`; desktop: a rail card in `GroupDetailDesktop`); the expense
detail/edit screen for `source: 'group'` shows "From group Flat, amount follows the group" with
amount/date/currency read-only (the desktop transactions dialog hosts the same screen); the `group`
source label in the expense list (phone and desktop table). i18n about 20 mobile x 9.

Tests: the accounting table (payer, debtor, mixed with netting): the sum of counted rows equals
consumption and nothing is double-counted when legs are linked; auto-link only on a single exact
candidate; turning off reverts atomically; a user-deleted share row is not resurrected; tier >= 1
refused; a viewer account refused; the reconciler is idempotent; merge and claims re-sync.

## I. Bots: add an expense to a group

**Decision.** A command on all three bots, with the same flow and no AI call: `group <amount>
[currency] [description]` (Telegram `/group`). One active group -> straight to confirm; several ->
a picker of up to 10 groups by recent activity (Telegram inline keyboard; WhatsApp interactive list,
whose 10-row cap is the constraint; Slack `static_select`, sidestepping the 5-button cap). The
confirm card reads "Flat · 120,00 PLN · pizza · paid by you · split equally among 4", with
Confirm/Cancel. Defaults are fixed: payer = me, equal split among all live members. Anything else
gets an "open in the app" link.

- **Authorization.** The linked bot identity -> `userId` -> live member of an **active** group,
  re-resolved **at confirm time** (never trusted from the cached draft). The account viewer role is
  deliberately **not** applied: groups are not account-scoped, exactly as in the app. This is an
  intentional asymmetry with the other bot write handlers, and a comment says so.
- **Idempotency.** The draft (`telegram:grp:{shortId}`, `wa:grp:{id}`, `slack:grp:{id}`, TTL 1800 s,
  in `CacheService`, never a module `Map`) carries a `clientRequestId` minted at draft time, so a
  double-tapped Confirm hits the existing `createExpense` dedup. Callback ids use `--` on WhatsApp.
- **Currency** via F (a foreign amount converts; an unknown rate gives a clear message).
- `notifyActivity` fires as for any write. There is no AI usage charge.
- **i18n**: about 10 keys in `common/bot-i18n/shared-messages.ts` (shared by all three, as the rule
  requires), plus the `helpText` per platform. `user_docs` bot and groups pages updated.

No screens, so the desktop rule does not apply. Tests per bot: no group, one group, picker, archived
between draft and confirm, removed between draft and confirm, double confirm creates one expense, a
viewer of the bot's account can still add.

## J. Offline write gating

**Decision: a pure-JS connectivity signal, no native module.** NetInfo and `expo-network` are both
native. NetInfo's codegen is the same Windows MAX_PATH risk that made the repo drop
`react-native-keyboard-controller`, and either would need a new store build before it did anything.
The real question for a server-only screen is also "can I reach the API", which link-level
connectivity does not answer (captive portals, a down server).

- `src/services/connectivity.ts`: a small zustand store `{status: 'online' | 'offline' | 'unknown'}`
  in memory.
- **Signal**: `http-client.ts`'s single `fetch` reports the outcome (any HTTP response means online;
  a rejected `fetch` is an *offline candidate*). A candidate becomes `offline` only after a probe of
  public `GET /health` also fails. On web an nginx 429 without CORS headers is also a `TypeError`
  (`docs/ops/api-rate-limit.md`), and the probe stops that from reading as offline.
- **Recovery**: while offline, probe with backoff 5 s -> 60 s; re-probe on `AppState` 'active'
  (native) and on `online`/`offline` events (`connectivity.web.ts`, `navigator.onLine` as a hint only).
- `src/hooks/useConnectivity.ts` -> `{isOffline}`; `unknown` counts as online, so nothing is ever
  disabled before the first answer.
- Group screens: an `OfflineBanner` component plus disabled write affordances. On the phone that is
  `GroupsListView` (new/join), `GroupDetailView` (add, settle, members writes),
  `GroupExpenseForm`/`GroupSettleView`/`GroupMembersView` (submit buttons). On desktop it is the
  `GroupsDesktop`/`GroupDetailDesktop` toolbar buttons, rail Settle buttons and the dialog footers
  (the hosted views disable their own submit, and footers read the same `canSubmit` state).
  Reads are never blocked.
- It is reusable: other server-only stores (receipt split, trips) can adopt it later. That is out of
  scope here.

i18n: 2 keys x 9. Tests: the pure state machine (candidate -> probe fail -> offline -> probe ok ->
online; 429-shaped TypeError + probe ok stays online), backoff schedule.

## K. Short link on the apex

**Decision: redirect, not proxy.** `https://ai-budget.pl/g/<token>` answers **302** to
`https://api.ai-budget.pl/g/<token>`. The guest page keeps living on the API host.

- **Why redirect.** A proxy moves the page to a new origin. Every existing guest's cookie (host-only,
  `Path=/g/<token>` on `api.ai-budget.pl`) stops being sent, so each guest re-identifies once, and
  their name is already claimed, so they need the restore code or an owner reset (C). Proxying would
  also need the CSP `form-action`, `isTrustedRequestOrigin`'s own-origin and the apex rate limit
  reconsidered, and it would move `/s/` and `/sl/` question with it. A redirect changes none of it:
  same origin, same cookies, same headers. The cost is that the address bar shows `api.` after the
  hop, which is acceptable: the shared message, QR and copy-link show the apex.
- **302, not 301**: browsers cache a 301 indefinitely, so switching to a proxy later would need a
  cache flush nobody can do. Use 302, not 307: a stray POST becomes a GET, and nothing mutates on a
  GET.
- **nginx** (VPS only, `/opt/shared-nginx/conf.d/ai-budget.conf`, apex `server_name ai-budget.pl`
  block, before `location /`):
  `location ^~ /g/ { add_header X-Robots-Tag "noindex" always; add_header Referrer-Policy
  "same-origin" always; return 302 https://api.ai-budget.pl$request_uri; }`, then
  `nginx -t && nginx -s reload` (never recreate `shared-nginx`).
- **API**: a new env `GROUP_SHARE_BASE_URL` used **only** by `GroupsService.buildGuestUrl` (default
  falls back to today's `APP_PUBLIC_URL || https://api.ai-budget.pl`). `APP_PUBLIC_URL` and
  `isTrustedRequestOrigin` are untouched. **Order**: nginx block, verify a live token through the
  apex, then set the env and `up -d --force-recreate api` (`docker restart` does not reload
  `env_file`). Old `api.` links keep working forever.
- Mobile: none. `extractGroupToken` already parses the apex form. Add a test pinning it.
- Runbook: `docs/ops/group-short-link.md` (and a pointer in `receipt-split-rollout.md`, whose
  `/s/` proxy question stays open).

Tests: `buildGuestUrl` honours the env; pasted-link parse test for the apex form; manual: curl
`-I` the apex link and confirm `302` plus headers, open in a browser and confirm an existing guest is still
identified.

---

## Shippable tasks (one issue = one commit each), in order

| # | Task | Items | Agents | Migration | Reviews |
|---|---|---|---|---|---|
| 1 | Connectivity signal + offline gating on group screens (phone + desktop) | J | mobile-engineer, web-engineer | — | — |
| 2 | Apex short link `ai-budget.pl/g/` (302) + `GROUP_SHARE_BASE_URL` + runbook | K | devops-engineer, backend-engineer | — | devops; security (light: redirect headers) |
| 3 | Ownership transfer, owner departure/succession, orphan adoption, event log, activity event rows (phone + desktop + guest) | B | db, backend, mobile, web | `_group_ownership_transfer` | **security** (authz, account deletion hook) |
| 4 | Per-member claim reset | C | backend, mobile | — (uses B's enum) | **security** (guest identity) |
| 5 | Partial / custom settlements (balance-bounded) incl. guest form | E | backend, mobile, web | — | **security** (public write validation) |
| 6 | Balance reminder pushes + `notifyGroupReminders` | A | db, backend, mobile | `_group_balance_reminders` | devops (new cron) |
| 7 | Multi-currency, write-time conversion | F | db, backend, mobile, web | `_group_expense_fx` | security (light: guest form field) |
| 8 | Line items + claims: schema, math, app routes, guest claim form | G (server) | db, backend | `_group_expense_items` | **security** (new public write) |
| 9 | Line items + claims: app item editor, `GroupClaimsView` route + desktop dialog | G (UI) | designer -> mobile, web-designer -> web | — | — |
| 10 | Merge two members (owner, unclaimed absorb, self-merge via link code) | D | db, backend, mobile | `_group_member_merge` | **security** (identity + money re-pointing) |
| 11 | Bots: add an expense to a group (Telegram, WhatsApp, Slack) | I | backend | — | **security** (bot write path) |
| 12 | `Income.isSplitReceivable` + income-total exclusion (behaviour-neutral) | H1 | db, backend, mobile | `_income_split_receivable` | — |
| 13 | Budget mirror server: share rows, cash-leg links, two-tier matcher, sweep cron | H2 | db, backend | `_group_budget_mirror` | **security** (group -> personal account writes), devops (sweep cron) |
| 14 | Budget mirror UI (phone + desktop), read-only `group` source rows | H3 | mobile, web | — | — |

Order rationale: 1-2 are independent and small. B lands the event log that C and D use. E precedes
A so reminders link to a settle screen that accepts a partial payment. F precedes G (line prices in a
foreign currency) and I (a foreign amount from a bot). G precedes D so the merge re-points claims in
one place. H goes last: it depends on F, G and D re-syncs, and its model is the user's call. Tasks 8
and 13 are dark until 9 and 14 (no client can create item expenses or turn the mirror on). That is
deliberate, to keep each commit reviewable.

Each task's commit includes its i18n x 9, `user_docs` updates (`<lang>/NN-shared-groups.md` x 9;
bots page for 11), the wiki page update (`shared-groups.md`: the item leaves Known gaps, and the
invariants go in) and a `log.md` line, per finish-aba-task.

## Threats (new in phase 2)

| # | Threat | Mitigation |
|---|---|---|
| 1 | Settling a fake amount to become a creditor (E) | Balance-bounded rule: both balances only shrink, never flip; CAS; receiver can void |
| 2 | Owner hands a guest's identity to someone else (C) | Owner-only, event row; no new power beyond editing every expense |
| 3 | Merge used to steal a creditor's balance (D) | Consent rule: survivor's holder performs it; app-to-app refused; link-code proof for claimed guests; in-transaction balance assertion; event row on both surfaces |
| 4 | Guest claim form plants a foreign item id (G) | Items intersected with the expense's real rows, re-scoped to the group; `l_` hidden keys bound the change to rendered lines |
| 5 | Late claim silently reshapes co-claimants (G) | 7-day window, then only creator/payer/owner; push to affected app users; "still being divided" note on settle surfaces |
| 6 | Group data written into a personal account the user cannot write (H) | Account membership + non-viewer + tier 0 checked server-side; every linked id re-scoped to `{userId, accountId}` |
| 7 | Plaintext server-written rows in an E2EE account (H) | Opt-in refused at `encryptionTier >= 1` |
| 8 | Bot writes for a removed member or archived group (I) | Re-resolve membership and status at confirm, not at draft |
| 9 | Ownership lost or group deleted with the owner (B) | Succession hook on both departure paths + `SetNull` FK backstop |
| 10 | Redirect becomes an open redirect (K) | Constant host in `return 302`, path from `$request_uri` only; `^~ /g/` prefix |
| 11 | Leaking app-user status on the guest page (B, C) | Only `member_merged` events render there |
| 12 | Reminder spam (A) | One push per user per run, weekly, max 4 per episode, own opt-out |

## Edge cases

- **Multi-account**: H writes only into the account the user picked; the share-row unique key is per
  member, so two group members who share one personal account each get their own row, which is
  correct because each consumed their own share.
- **Sync**: share rows are server-created Expenses pulled to the device like subscription renewal
  rows; they need a non-null `clientId` (`randomUUID()`, the ABA-351 lesson). Group data itself
  never syncs (no `SyncXxxPayload`, `dto/sync.ts` untouched) except the H1 column, which rides the
  existing Income payload.
- **Migration safety**: all additive except B's `owner_user_id DROP NOT NULL` + FK swap (safe,
  widening) and its data step; H1 adds a defaulted column to `incomes` (fast on PG16).
- **i18n volume**: about 95 mobile, about 20 guest, about 8 push and about 10 bot keys, each x 9.
- **Performance**: the reminder cron and the mirror sweep call `loadState` per group, which is
  bounded by the 5 000-expense cap and paginated. They run once a day. If group counts grow, the
  follow-up is to skip groups whose `ledgerVersion` has not changed since the last run.
- **Bot parity**: identical flow on all three; the asymmetries are platform limits (WhatsApp 10-row
  list, Slack select instead of buttons).
- **Viewer role**: not applicable to any group route or bot group command (locked decision 1).
- **Data portability**: nothing device-local is added (the connectivity store is in memory).
- **Infra**: new cron jobs (reminders 17:00 UTC; H2 sweep), new Redis keys (`telegram:grp:*`,
  `wa:grp:*`, `slack:grp:*`, 30-minute TTL), one nginx location. No container or memory changes.

## Testing

Pure modules get unit tests: `nextReminderState`, `validateSettlement`, `group-merge.ts` planner
(property test on balance preservation), the claims-to-shares mapper (parity with `resolveItemSplit`),
the F weights conversion, the connectivity state machine, and the H accounting table. Service
specs cover each route's re-scoping and consent matrix. The B hard-delete test and the existing
"DELETE with ledger data" gap need a **real Postgres** run, because mocked Prisma hid an FK-order
bug before (ABA-351). Manual, per UI task: phone on a device and desktop at 1024/1440 in light and
dark mode. Nothing renders in CI.

## Required pre-merge reviews

- `aba-security` audit — **required** for tasks 3, 4, 5, 8, 10, 11 and 13: ownership/authz and the
  account-deletion hook, guest identity reset, the public settle validation change, the new public
  claim write, identity merge and link-code merge, bot write path, and cross-boundary writes from a
  shared ledger into personal accounts. Light review for tasks 2 (redirect headers) and 7 (new guest
  form field).
- `aba-devops-engineer` review — **required** for task 2 (VPS-only nginx location on the shared box,
  new env, rollout order), task 6 (new daily cron) and task 13 (sweep cron). The others: not
  required.

## Decisions that are the user's

**Decided by the user on 2026-10-09: all five recommendations accepted** — H ships last as the
consumption mirror; a hard-deleted user's member rows are renamed "Former member"; reminders on by
default, weekly, at most 4; everything free; the short link 302s to `api.ai-budget.pl`.

1. **H accounting model (product + accounting).** Consumption mirror as above, or keep the cash
   model (budget shows what you paid) and skip H. *Recommendation: consumption mirror, shipped last,
   with the "unlinked payment counts twice" card and the wallet-divergence trade-off stated in the
   UI.*
2. **Account deletion and member names (legal / GDPR).** On a hard delete, the member row survives
   with its display name in other people's ledgers. *Recommendation: keep the row (it is shared
   ledger history), and rename it to a neutral "Former member" on hard delete only; confirm with
   whoever owns privacy terms.*
3. **Reminder defaults (product).** Creditor-side "you are owed" pushes, on by default, weekly, at
   most 4. *Recommendation: as written.*
4. **Pricing.** Keep every phase-2 item free (MVP locked decision 9), including multi-currency and
   the budget mirror. *Recommendation: free; groups are the acquisition loop.*
5. **Short link presentation (product).** Accept `api.ai-budget.pl` in the address bar after the
   302. *Recommendation: accept; revisit a proxy together with `/s/` and `/sl/` and a device-handoff
   design.*

## Follow-ups

- A proxy for `/g/`, `/s/`, `/sl/` on the apex with a one-time device handoff (needs C live).
- An `add_group_expense` AI chat tool (AI tool-call surface: its own security review).
- Adopting the connectivity hook in receipt split, trips and shopping list.
- Per-group reminder mute; reminder windows on `user.timezone`.
- Lift `escapeHtml`/lang resolver/`buildGuestPayLink` into `common/guest-page/` (still open).
- Admin metrics: orphaned groups, itemised share, mirror opt-ins.

## Out of scope

- Settlements in a currency other than the group's.
- Guests creating itemised expenses.
- Historical FX rates or any re-conversion job.
- Reversing a merge.
- Email or SMS reminders to guests.
- Any `Expense`/`Income` write from the ledger **except** H's opt-in share rows and leg flags.
- Converting an existing receipt split or trip into a group.
