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

Migration: `20261009000000_add_expense_groups`. Design:
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

**Settling.** The acting member must be the transfer's `from` or `to`; the `{from, to, amount}`
triple must match a current suggested transfer within 0.01, checked **before any write**; then one
`$transaction` does a compare-and-swap on `ExpenseGroup.ledgerVersion` and creates the settlement,
or fails with 409 `LEDGER_CHANGED`. Every ledger write (expense create/edit/delete, settle, void)
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
- **What the page may show.** Display names, descriptions, amounts, dates, and a creditor's
  payment handle only on the transfer row where the viewer pays that creditor. Never a `userId`,
  email, `accountId`, or whether a member is an app user. A guest deletes only expenses they
  created; a foreign id in a form is a silent no-op.

**Guest → user linking.** A cookie-identified guest taps "Open in the app" / "Continue in the
browser app": `POST /g/:token/link` mints a single-use code in Redis (`grp:link:{code}`, 10 min)
bound to `{groupId, memberId, guestToken}` and 303s to a **constant** base (web
`app.ai-budget.pl/groups/link?code=…&src=group&loc=guest_link`, or `budget://groups/link` on an
Android user agent) — only the code is appended, so there is no open redirect. The code is read
back after writing, because `CacheService.set` swallows Redis errors. `POST /groups/link-guest`
redeems it with an atomic GETDEL, re-reads the group and refuses (410 `LINK_CODE_INVALID`) when
the token has rotated since, guest access is off or the group is archived; 409 `ALREADY_MEMBER`
when the caller is already in the group. Success sets `userId` on the member row — history and
balances carry over with no re-pointing — and clears the claim, so the browser cookie stops acting
as that member.

**Push.** `group_activity` with data `{groupId}`, fire-and-forget through `logFireAndForget`, to
app-user members other than the actor, gated by `User.notifyGroupActivity` (the toggle in
notification settings), and coalesced per recipient per group for 10 minutes through
`CacheService.setIfAbsent('grp:push:{groupId}:{userId}')`. Sent on expense create/edit and settle.

**Members.** Removal is soft and requires a zero balance. The owner cannot leave. A member the
owner removed (`removedByOwner`) cannot walk back in through the link (403 `GROUP_REMOVED`); a
self-removed one may rejoin through the normal archive and member-cap checks. The member cap is
enforced inside a transaction that first locks the group row, so concurrent joins cannot overshoot
it.

## Invariants

- **Groups must not move into `Account`/`Expense`.** The model is standalone on purpose (above);
  a group write must never create an `Expense` or `Income` row in this iteration — that is what
  keeps every personal total free of group money without a filter.
- **Every incoming member, expense and settlement id is re-scoped to the group** (`{id, groupId}`,
  members also `removedAt: null`) before use. The group itself comes from the guard (app) or the
  token (guest), never a body field. That is the IDOR line.
- **The guest actor comes only from the hashed cookie secret.** Never accept a member id from a
  form as "who I am" — a member id in a form is a target, re-scoped, never an identity.
- **A settlement is validated against the current suggested transfers before any write, and the
  write is a CAS on `ledgerVersion`.** Without the CAS a double-tap, or two members settling the
  same transfer, mints two settlements.
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
- **The app join cannot pick an unclaimed name.** `app/groups/join.tsx` only creates a new member by
  name; there is no preview endpoint listing a group's placeholders for an app user, although
  `JoinGroupDto.memberId` is accepted by the API.
- **Writes are not disabled offline.** The store is online-only, but there is no connectivity hook
  in the app to disable the buttons, so an offline write simply fails with the error state.
- **`DELETE /groups/:id` with ledger data is unverified against real Postgres.** It is a hard
  delete that cascades from the group, while the member FKs on expenses, shares and settlements are
  `NO ACTION`; the specs mock Prisma, so whether the cascade order succeeds on a group with history
  has not been exercised.
- Partial or custom settlement amounts, merging two members, ownership transfer (deleting the owner's
  user account cascades the group away for everyone), per-member claim reset, reminder pushes, an
  apex `/g/` nginx block, and bot channels are all out of the MVP.
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
