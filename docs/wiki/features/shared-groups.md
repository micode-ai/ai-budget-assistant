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
- `apps/api/src/modules/groups/group-ownership.service.ts` — ownership transfer, succession on an
  account departure, orphan adoption, the "Former member" rename (ABA-650)
- `apps/api/src/modules/groups/helpers/group-guest-page.ts` and
  `apps/api/src/modules/groups/helpers/group-guest-page-i18n.ts` — the script-free HTML page, 9 locales
- `apps/api/src/modules/groups/guards/` — `GroupMemberGuard`, `GroupOwnerGuard`, `GroupActiveGuard`

Shared types: `packages/shared-types/src/entities/group.ts`, `packages/shared-types/src/dto/group.ts`.

Mobile:
- `apps/mobile/app/groups/` — `index`, `new`, `join`, `link`, and `[id]/` (`index`, `expense`,
  `settle`, `members`)
- `apps/mobile/src/components/groups/` — the screen bodies
- `apps/mobile/src/stores/groupStore.ts`, `apps/mobile/src/services/groups.api.ts` — in-memory,
  server-only; reset on sign-out from `apps/mobile/src/stores/authSessionActions.ts`
- `apps/mobile/src/features/groups/` — pure helpers (split validation, display, pay links, link codes)
- `apps/mobile/src/hooks/useGroupLinkDeepLink.ts` — a link code stashed while signed out
- Entry: the `groups` quick action (`apps/mobile/src/stores/quickActionStore.ts`); the push opens
  `/groups/:id` (`apps/mobile/src/services/notifications.ts`)

Migrations: `20261009000000_add_expense_groups`, `20261012000000_group_member_join_provenance`,
`20261013000000_group_ownership_transfer`. Design:
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
plain ids with **no FK**, so the later merge task never re-points audit rows. `owner_transferred`
covers four cases told apart by its fields: actor = subject = old owner and a target is a manual
transfer; no actor is a succession; no actor and no target is orphaning; subject = target is an
adoption (`apps/mobile/src/features/groups/groupOwnership.ts` `describeGroupEvent`). `getActivity`
merges it as a third source (`{kind: 'event'}`), with the actor's and target's CURRENT names.
`GUEST_VISIBLE_EVENT_KINDS` (`member_merged` only) is applied **in the query** for the guest page,
and the guest service drops any other kind a second time: an owner or claim-reset event would reveal
that a member is an app user.

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

- **Line claims** (per-item splitting like receipt-split) are phase 2: a claim changes shares after
  others may have settled against them, and the right lock rule for an ongoing ledger is open.
- **One currency per group**, changeable only while the group has no expenses. Multi-currency must
  store a write-time-converted amount — never convert at read time, or a settled ledger drifts with
  FX and un-settles itself.
- **"Count my share in my budget"** — linking a group expense to the user's own Expense with
  receipt-split accounting — is phase 2.
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
- Merging two members, reminder pushes and bot channels are phase 2 (`docs/superpowers/specs/2026-10-09-shared-groups-phase2-design.md`).
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
