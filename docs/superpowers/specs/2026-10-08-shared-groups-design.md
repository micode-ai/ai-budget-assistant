# Shared expense groups by link (ABA-640) — Design

Issue: GitHub #670 (ABA-640). Builds on `docs/wiki/features/receipt-split.md`,
`receipt-split-item-shares.md`, `trip-wallet.md`, `acquisition-tracking.md`.

## Goal

Ongoing groups ("Mieszkanie", "Wyjazd do Zakopanego", "Wspólne zakupy") that an app user creates,
and that friends **without an account** use from a browser link: see who paid, the running balances
("kto komu ile") and the history, add an expense, and settle up in one tap with the fewest transfers.
This replaces Splitwise for people leaving its free tier, and every group puts 3–6 non-users in
front of the product. Install prompts show up only where the app genuinely does more (reminders,
receipt scanning). They never block anything.

## Locked decisions

1. **A standalone model.** It is not a new `AccountType` and not a trip-wallet variant. See "The
   decision" below. Role agents must not move groups into `Account`/`Expense`.
2. **A group member is an `ExpenseGroupMember` row. It is never a `User`.** `userId` is nullable:
   NULL means a guest. Every payer, share and settlement references a **member id**.
3. **The group ledger never writes an `Expense` row in this iteration.** So it contributes nothing to
   any personal total by construction (see "Money and the user's own budget").
4. **One currency per group**, fixed at creation. It can be changed only while the group has no
   expenses. Multi-currency is phase 2.
5. **Line claims are phase 2.** The MVP splits are equal / exact / percentage / shares, the four
   types `resolveShares` already supports. The guest form offers equal and exact.
6. **Guest routes go in a new controller, `GroupGuestController` at `@Controller('g')`.** They do
   not extend `GuestController`. See "Guest surface placement".
7. **The guest page is server-rendered, script-free HTML from the API.** It uses the same posture as
   `GuestController` and `ShoppingListGuestController`. It is not a route in the Expo web app.
8. **Mobile is online-only, with a server-only store and no SQLite mirror.** This is the same shape
   as `receiptSplitStore`/`tripStore`.
9. **Free on every tier.** It is an acquisition loop. Abuse is bounded by hard caps, not a paywall.

## The decision: standalone model, not an AccountType, not a trip variant

| Option | Why it fails |
|---|---|
| New `AccountType.group` | `AccountMember.userId`, `Expense.userId`, `TripExpenseShare.userId` and `SettleUpTransaction.{from,to}UserId` are all non-null FKs to `User`. A guest cannot pay, owe or be paid. An `Account` also drags in categories, budgets, wallet balances, the account switcher, `/sync`, analytics, the AI `UserContext`, anomaly detection, gamification and the Family Feed. Every one of those would need a "but not for groups" branch, or it would leak group spend into it. |
| Trip-wallet variant | It has the same User-FK problem, since trip identity is `userId` end to end. Making those columns nullable would break the trip invariants ("`pay` checks `dto.fromUserId === req.user.id`") for the shipped feature. A trip is also a temporary account with a lifecycle that ends in archive, while a group is ongoing. |
| **Standalone `ExpenseGroup` + members** | Guests are first-class through a member id. Nothing account-scoped sees the ledger. What we reuse is the **pure math** (`resolveShares`, `computeBalances`, `simplifyDebts`), not the persistence. Both calculators key on an opaque string `userId`, so passing a member id needs no change to them. |

**Scoping exception, stated explicitly:** groups are **not account-scoped**. A group belongs to its
members, not to anyone's account. That follows the per-`userId` precedent of exchange-rate alerts
and of `GET /wallet/summaries`. As a result, `AccountContextGuard` and `ViewerBlockGuard` do **not**
apply: an account's viewer role has no meaning for a group. A group-membership guard replaces them
(see API).

## Guest surface placement: beside `GuestController`, not inside it

- `GuestController`'s header invariant is "never expose another participant's name or amount". The
  group page exists to show **every** member's name and balance. Putting both in one class would
  make that invariant false for half the file.
- There is already a precedent for a second, sibling public controller: `ShoppingListGuestController`
  at `sl/`, with its own `'sl/(.*)'` wildcard. **The CLAUDE.md and wiki statement that
  `GuestController` is "the app's ONLY unauthenticated surface" is already stale.** The ingest step
  for this feature corrects it to "the guest surfaces are `s/`, `sl/`, `g/`".
- New entry `'g/(.*)'` in `apps/api/src/global-prefix-exclusions.ts`, with the same one-wildcard
  reasoning. `global-prefix-exclusions.spec.ts` gains a reflection over `GroupGuestController`'s
  routes. `/g` is free: the existing QR routes are `/s/g/...` and no controller is mounted at `g`.
- Shared code is **imported, not copied**: `escapeHtml`, `buildGuestPayLink` and the lang resolver
  come from `receipt-split/helpers/`. Moving them to `common/guest-page/` is a follow-up and is not
  required.

## Data model

Migration: **`20261009000000_add_expense_groups`** (additive only, nothing to backfill).

```prisma
enum ExpenseGroupStatus {
  active
  archived
}

model ExpenseGroup {
  id            String             @id @default(uuid())
  name          String                                    // 1..60, trimmed
  emoji         String?                                   // single grapheme, optional
  currencyCode  String             @map("currency_code")  // immutable once any expense exists
  ownerUserId   String             @map("owner_user_id")
  // Bearer credential for the public link: randomBytes(16).hex (128-bit, same TOKEN_BYTES as
  // receipt-split). Stored plain because the members re-share it. Rotation = new value.
  guestToken    String             @unique @map("guest_token")
  guestAccess   Boolean            @default(true) @map("guest_access") // owner kill-switch
  status        ExpenseGroupStatus @default(active)
  // Compare-and-swap counter, bumped by EVERY ledger write inside its $transaction.
  // A settlement must quote the version it was computed against (see "Settle-up").
  ledgerVersion Int                @default(0) @map("ledger_version")
  archivedAt    DateTime?          @map("archived_at")
  createdAt     DateTime           @default(now()) @map("created_at")
  updatedAt     DateTime           @updatedAt @map("updated_at")

  owner       User                 @relation("OwnedExpenseGroups", fields: [ownerUserId], references: [id], onDelete: Cascade)
  members     ExpenseGroupMember[]
  expenses    GroupExpense[]
  settlements GroupSettlement[]

  @@index([ownerUserId])
  @@map("expense_groups")
}

model ExpenseGroupMember {
  id             String        @id @default(uuid())
  groupId        String        @map("group_id")
  userId         String?       @map("user_id")          // NULL = guest
  displayName    String        @map("display_name")     // 1..40, trimmed, shown to everyone with the link
  nameKey        String        @map("name_key")         // displayName.trim().toLowerCase()
  // sha256(hex) of the guest's device secret (the cookie value). NULL = unclaimed placeholder
  // (added by name, nobody has taken it yet). An app-user member has no secret until it
  // also uses a browser. Never stored in plaintext.
  claimTokenHash String?       @unique @map("claim_token_hash")
  claimedAt      DateTime?     @map("claimed_at")
  paymentMethod  SettleMethod? @map("payment_method")   // set per group by the member themself
  paymentHandle  String?       @map("payment_handle")   // ≤ 64 chars
  removedAt      DateTime?     @map("removed_at")       // soft removal, only at zero balance
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  user          User?             @relation(fields: [userId], references: [id], onDelete: SetNull)
  group         ExpenseGroup      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidExpenses  GroupExpense[]    @relation("GroupExpensePayer")
  shares        GroupExpenseShare[]
  settlementsFrom GroupSettlement[] @relation("GroupSettlementFrom")
  settlementsTo   GroupSettlement[] @relation("GroupSettlementTo")

  @@unique([groupId, nameKey])   // names are the guest's only identity cue; no duplicates
  @@unique([groupId, userId])    // one member per app user per group (NULLs distinct → many guests)
  @@index([userId])
  @@map("expense_group_members")
}

model GroupExpense {
  id                String    @id @default(uuid())
  groupId           String    @map("group_id")
  description       String                                  // 1..120
  amount            Decimal   @db.Decimal(12, 2)            // group currency, > 0, ≤ 1_000_000
  date              DateTime  @db.Date
  paidByMemberId    String    @map("paid_by_member_id")
  splitType         ShareType @map("split_type")            // reuses the trip enum
  createdByMemberId String    @map("created_by_member_id")
  // Idempotency: app = client UUID; guest = hidden `rid` nonce minted at form render.
  clientRequestId   String?   @map("client_request_id")
  deletedAt         DateTime? @map("deleted_at")            // soft, shown in history, out of balances
  deletedByMemberId String?   @map("deleted_by_member_id")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  group  ExpenseGroup        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidBy ExpenseGroupMember  @relation("GroupExpensePayer", fields: [paidByMemberId], references: [id], onDelete: Restrict)
  shares GroupExpenseShare[]

  @@unique([groupId, clientRequestId])
  @@index([groupId, deletedAt, date])
  @@map("group_expenses")
}

model GroupExpenseShare {
  id             String       @id @default(uuid())
  groupExpenseId String       @map("group_expense_id")
  memberId       String       @map("member_id")
  shareValue     Decimal?     @map("share_value") @db.Decimal(12, 4) // raw input (exact / % / units); NULL for equal
  shareAmount    Decimal      @map("share_amount") @db.Decimal(12, 2) // resolved by resolveShares
  expense GroupExpense       @relation(fields: [groupExpenseId], references: [id], onDelete: Cascade)
  member  ExpenseGroupMember @relation(fields: [memberId], references: [id], onDelete: Restrict)

  @@unique([groupExpenseId, memberId])
  @@index([memberId])
  @@map("group_expense_shares")
}

model GroupSettlement {
  id                 String        @id @default(uuid())
  groupId            String        @map("group_id")
  fromMemberId       String        @map("from_member_id")
  toMemberId         String        @map("to_member_id")
  amount             Decimal       @db.Decimal(12, 2)
  method             SettleMethod?
  recordedByMemberId String        @map("recorded_by_member_id")
  clientRequestId    String?       @map("client_request_id")
  voidedAt           DateTime?     @map("voided_at")
  voidedByMemberId   String?       @map("voided_by_member_id")
  createdAt          DateTime      @default(now()) @map("created_at")

  group ExpenseGroup       @relation(fields: [groupId], references: [id], onDelete: Cascade)
  from  ExpenseGroupMember @relation("GroupSettlementFrom", fields: [fromMemberId], references: [id], onDelete: Restrict)
  to    ExpenseGroupMember @relation("GroupSettlementTo", fields: [toMemberId], references: [id], onDelete: Restrict)

  @@unique([groupId, clientRequestId])
  @@index([groupId, voidedAt])
  @@map("group_settlements")
}
```

`User` additions: `notifyGroupActivity Boolean @default(true) @map("notify_group_activity")`,
`ownedExpenseGroups ExpenseGroup[] @relation("OwnedExpenseGroups")`, and
`expenseGroupMemberships ExpenseGroupMember[]`.

Notes for `aba-db-engineer`:
- Member FKs are `Restrict`, because members are only ever soft-removed. Group FKs cascade.
- When an app user is deleted, `userId` is set to NULL. The member then lives on as a guest-like row,
  so the other members' history survives. When the **owner** is deleted, the group cascades away
  (MVP). Ownership transfer is phase 2 and is documented as a known gap.
- The `schema.prisma` change and the migration land in **one commit** (ABA-558).

Hard caps, enforced in the service: 20 active groups owned per user, 50 members per group, 5 000
expenses per group, and 20 shares per expense (= live members).

## Money math

New pure module `apps/api/src/modules/groups/group-ledger.ts`. No DI, fully unit-tested.

- **Shares**: `resolveShares(amount, splitType, raw)` is imported from
  `modules/expenses/trip-share-calculator.ts`. `RawShare.userId` carries the **memberId**. Exact
  shares must sum to the amount (it throws, and the service maps that to 400). The last member
  absorbs the residual cent.
- **Balances**: `computeBalances` is imported from `modules/trip-settle-up/settle-up-calculator.ts`
  and fed with:
  - each live expense as `{paidByUserId: paidByMemberId, amountInAccountCurrency: amount, shares}`;
  - each **non-voided settlement** as a synthetic entry
    `{paidByUserId: fromMemberId, amountInAccountCurrency: amount, shares: [{userId: toMemberId, shareAmount: amount}]}`.
    The payer goes up by X and the receiver goes down by X, which is exactly what a repayment does.
    Settlements therefore net into the **same** array that feeds `suggestedTransfers`, satisfying the
    trip invariant "confirmed payment reduces the displayed debt in both fields".
  - Every live member is padded in with `netAmount: 0`, so a member with no activity still shows.
  - Invariant (asserted in tests): the balances sum to 0 within 0.01.
- **Simplify**: `simplifyDebts(balances)` as is. It is greedy and yields **at most n−1 transfers**.
  It is not guaranteed globally minimal (that problem is NP-hard). User copy says "fewest transfers"
  only loosely and never promises "minimum". Do not repeat the trip page's word "minimum" in the
  wiki.
- **Currency**: the group has one currency. Expenses carry no currency column in the MVP, and every
  amount is in `ExpenseGroup.currencyCode`. Phase 2 must store a write-time-converted amount plus the
  original. It must **not** convert at read time the way `trip-settle-up.service.ts` does, because a
  settled ledger that drifts with daily FX would un-settle itself.
- **Deleting a member's activity**: removing a member requires that member's balance to be 0.

## Money and the user's own budget

- The MVP creates **no `Expense`/`Income` rows**. Analytics, budgets, safe-to-spend, wallet, the AI
  `UserContext`, anomaly and gamification therefore never see group money. No `isSplitReceivable` or
  `isDebt` filter is involved. Nothing needs filtering because nothing is written.
- The group screen shows "your share this month" (the sum of `shareAmount` for my member over
  expenses dated in the current calendar month). That figure is display-only.
- **The real double-count risk is outside the ledger.** If the user also captures the same card
  payment through bank-notification capture, an import or a receipt scan, then their personal
  Expense is the full outflow, and the group records the same money again. In the MVP the two worlds
  are disjoint, so nothing is double counted. The cost is that the user's budget shows the full card
  payment rather than their share. Phase 2 "Count my share in my budget" has to resolve this. See
  Follow-ups: link to an existing Expense and apply the receipt-split accounting (full outflow, with
  the other members' shares as `isSplitReceivable` receivables, filtered by `isSplitReceivable`,
  **never** `isDebt`). Do not invent a third accounting rule.

## API surface — authenticated app routes

New module `apps/api/src/modules/groups/`: `groups.module.ts`, `groups.controller.ts`,
`groups.service.ts`, `group-ledger.ts`, `group-guest.controller.ts`, `group-guest.service.ts`
(the token-side writes, sharing the service internals), `guards/`, `dto/index.ts`, and
`helpers/group-guest-page.ts` + `helpers/group-guest-page-i18n.ts`. Add it to the API-modules list
in CLAUDE.md.

New guards in `modules/groups/guards/`:
- `GroupMemberGuard` resolves `ExpenseGroupMember` by
  `{groupId: params.groupId, userId: req.user.id, removedAt: null}` and sets `req.groupId` (taken
  from the **found row**) and `req.groupMember`. A non-member gets **404**, not 403, so the response
  never confirms that the group exists.
- `GroupOwnerGuard` requires `req.groupMember.group.ownerUserId === req.user.id`.
- `GroupActiveGuard` returns 403 `GROUP_ARCHIVED` on writes to an archived group. It is the
  equivalent of `TripArchivedGuard`.

Service signature: `(groupId, memberId, dto)`, both guard-derived. **Every incoming member id**
(`paidByMemberId`, `shares[].memberId`, `fromMemberId`/`toMemberId`, `:memberId`) is re-resolved
with `{id, groupId, removedAt: null}` before use. Every expense and settlement id is looked up by
`{id, groupId}`. That is the IDOR line.

| Verb | Route | Guards | Request | Response |
|---|---|---|---|---|
| GET | `/groups` | `JwtAuthGuard` | — | `GroupSummary[]` (name, emoji, currency, myBalance, memberCount, status) |
| POST | `/groups` | `JwtAuthGuard` | `CreateGroupDto {name, emoji?, currencyCode, myDisplayName?, memberNames?: string[]}` | `GroupDetail` |
| POST | `/groups/join` | `JwtAuthGuard` + Throttle 10/min | `JoinGroupDto {guestToken, memberId? \| displayName?}` | `GroupDetail` |
| POST | `/groups/link-guest` | `JwtAuthGuard` + Throttle 10/min | `LinkGuestDto {code}` | `GroupDetail` / 409 `ALREADY_MEMBER` / 410 `LINK_CODE_INVALID` |
| GET | `/groups/:groupId` | `JwtAuthGuard + GroupMemberGuard` | — | `GroupDetail` (members, balances, suggestedTransfers, ledgerVersion, guestUrl, myMemberId) |
| GET | `/groups/:groupId/activity?before=&limit=` | `JwtAuthGuard + GroupMemberGuard` | — | `GroupActivityPage` (expenses + settlements, newest first, deleted/voided flagged) |
| PATCH | `/groups/:groupId` | `+ GroupOwnerGuard + GroupActiveGuard` | `UpdateGroupDto {name?, emoji?, guestAccess?, currencyCode?}` | `GroupDetail` (400 if currency changes with expenses) |
| POST | `/groups/:groupId/rotate-link` | `+ GroupOwnerGuard` | — | `{guestUrl}`. Also clears every `claimTokenHash` |
| POST | `/groups/:groupId/archive` | `+ GroupOwnerGuard` | `{force?: boolean}` | `GroupDetail` (409 if non-zero balances and not force) |
| DELETE | `/groups/:groupId` | `+ GroupOwnerGuard` | — | `204` (hard delete, cascades) |
| POST | `/groups/:groupId/members` | `+ GroupMemberGuard + GroupActiveGuard` | `{displayName}` | `GroupMember` (placeholder guest) |
| PATCH | `/groups/:groupId/members/:memberId` | `+ GroupMemberGuard + GroupActiveGuard` | `{displayName?, paymentMethod?, paymentHandle?}` | `GroupMember`. Rename: self or owner. Payment info: **self only** |
| DELETE | `/groups/:groupId/members/:memberId` | `+ GroupMemberGuard + GroupActiveGuard` | — | `204`. Owner removes anyone, a member removes self. 409 unless balance is 0. Owner cannot remove self |
| POST | `/groups/:groupId/expenses` | `+ GroupMemberGuard + GroupActiveGuard` | `CreateGroupExpenseDto {clientRequestId, description, amount, date, paidByMemberId, splitType, shares: {memberId, value?}[]}` | `GroupDetail` (P2002 on `clientRequestId` → return the existing row) |
| PATCH | `/groups/:groupId/expenses/:expenseId` | `+ GroupMemberGuard + GroupActiveGuard` | same fields, optional | `GroupDetail`. Creator, payer or owner. Shares are fully delete+recreated (trip invariant) |
| DELETE | `/groups/:groupId/expenses/:expenseId` | `+ GroupMemberGuard + GroupActiveGuard` | — | `GroupDetail` (soft). Creator, payer or owner |
| POST | `/groups/:groupId/settlements` | `+ GroupMemberGuard + GroupActiveGuard` | `CreateGroupSettlementDto {clientRequestId, fromMemberId, toMemberId, amount, method?, ledgerVersion}` | `GroupDetail` / 409 `LEDGER_CHANGED` |
| DELETE | `/groups/:groupId/settlements/:settlementId` | `+ GroupMemberGuard + GroupActiveGuard` | — | `GroupDetail` (void). Recorder, receiver or owner |

App routes keep the global throttler. The mobile client still sends `X-Account-Id`. It is ignored:
no `AccountContextGuard` runs here.

**Settle-up rule** (used by both surfaces): the acting member must be `from` **or** `to`. A receiver
can mark "received" for a guest who never comes back. The `{from, to, amount}` triple must match a
current `simplifyDebts` transfer within 0.01, and this is validated **before any write**, following
the trip invariant. Then, inside one `$transaction`:
`updateMany({where: {id, ledgerVersion: dto.ledgerVersion}, data: {ledgerVersion: {increment: 1}}})`.
If the count is 0, the request fails with 409 `LEDGER_CHANGED` (refresh and retry). That stops a
double-tap, or two members settling the same transfer, from minting two settlements. **A payment
counts immediately**, Splitwise semantics, with no pending state. Guests visit sporadically, and a
pending state that waits for the creditor to come back would leave balances stale in the common
case. A wrong record is undone by voiding it, and the history shows who did what. Partial or custom
amounts are phase 2.

**Notifications**: a new push type `group_activity` with data `{groupId}`. It is sent fire-and-forget
(`logFireAndForget`) to app-user members other than the actor, gated by `notifyGroupActivity`, and
coalesced through `CacheService.setIfAbsent('grp:push:{groupId}:{userId}', 10 min)` so that a guest
entering five expenses produces one push. Strings go in `notification-i18n.ts` × 9. Add the toggle
to the mobile notification settings screen.

## API surface — guest routes (`GroupGuestController`, `@Controller('g')`)

All routes: `ThrottlerGuard` (Redis-backed, keyed by client IP; `trust proxy 1` is already set),
`Cache-Control: no-store`, `X-Robots-Tag: noindex`, `<meta name="referrer" content="no-referrer">`.
The page also gets a new, strict CSP (nothing on the existing guest pages sets one):
`default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`.
Every POST answers with a **303 redirect** to `GET /g/:token` (Post/Redirect/Get, following
`sl/`). If the token is unusable it renders the not-found page instead.

| Verb | Route | Throttle (IP) | Acting identity | Does |
|---|---|---|---|---|
| GET | `/g/:token` | 30/min | optional cookie | Read-only overview for anyone with the link: balances, "kto komu ile", latest 50 activity rows, members. With a cookie: "You are X", plus the add-expense, settle and payment-info forms. Without one: the "Who are you?" picker (unclaimed names + "I'm not on the list") |
| GET | `/g/:token/activity?before=<iso>` | 30/min | — | Older history page (cursor) |
| POST | `/g/:token/join` | 5/min | none → sets cookie | `{memberId}` claims an unclaimed guest placeholder, atomically through `updateMany where {id, groupId, userId: null, claimTokenHash: null}`. Or `{name}` creates a new guest member (cap 50, 409-style message on a name clash). Mints `randomBytes(16)`, stores the sha256, sets the cookie |
| POST | `/g/:token/expenses` | 10/min | cookie required | Equal (checkbox members) or exact (amount per member). `rid` hidden nonce → `clientRequestId` |
| POST | `/g/:token/expenses/:expenseId/delete` | 10/min | cookie | Only an expense this member **created** |
| POST | `/g/:token/settle` | 10/min | cookie | `{fromMemberId, toMemberId, amount, v}`. Same rule as the app (acting member is from or to, matches a current transfer, CAS on `v` = ledgerVersion) |
| POST | `/g/:token/settlements/:settlementId/void` | 10/min | cookie | Recorder or receiver only |
| POST | `/g/:token/payment-info` | 10/min | cookie | Sets own `paymentMethod`/`paymentHandle` (handle ≤ 64) |
| POST | `/g/:token/link` | 5/min | cookie | Mints a single-use app-link code and 303s to the app (see "Guest → user linking") |
| POST | `/g/:token/forget` | 10/min | cookie | Clears the cookie and this member's `claimTokenHash` ("not me / forget this device") |
| GET | `/g/:token/me/:secret` | 5/min | — | Device restore: if `sha256(secret)` matches a member of THIS group, sets the cookie and 303s to `/g/:token`, otherwise not-found. The link is shown once after joining, inside a `<details>` |

**Cookie**: name `abg_m`, value = the member secret, `Path=/g/<token>`, `HttpOnly; Secure;
SameSite=Lax; Max-Age=34560000` (400 days). Path-scoping means a guest in two groups has two
independent cookies, and rotating the token orphans the old ones. Rotation also clears every claim,
so after a rotation everyone re-identifies. That is intended: rotation is the "the link leaked"
remedy.

**CSRF**: SameSite=Lax already blocks a cross-site POST that carries the cookie. Defence in depth:
every form carries `csrf = sha256('grp-csrf:' + secret)`, checked with `timingSafeEqual`. No new env
var is needed, because the value is derivable only by someone holding the secret.

**Token resolution** keeps the two-step shape of `GuestController.findUsableParticipant`. Query 1
selects only the group's scalar columns by `guestToken`. An unknown token, `guestAccess = false` and
a deleted group all return the **byte-identical** not-found page. This page carries money and names,
so the `sl/` single-query shortcut does not apply. An archived group renders read-only, since it is
a legitimate state and guests should see the final ledger.

**What the guest page may render**: member display names, descriptions, amounts, dates, payer
names, and a creditor's `paymentHandle` only on the transfer row where that creditor is the
receiver, built through `buildGuestPayLink`. It may **never** render a `userId`, an email, any
`accountId`, or whether a member is an app user. Member, expense and settlement UUIDs do appear in
form fields. That is fine: they mean nothing without the token and are always re-scoped to the
token's group.

**Per-group write ceiling**: every guest write calls
`CacheService.incrementWindow('grp:w:{groupId}', 3600000)` with a cap of 200 per hour. Distributed
spam gets past a per-IP throttle, and this caps it. `incrementWindow` throws on a Redis outage, so
the guest write **fails closed** with a "try again later" page.

**Install prompts** (an inline `.btn-cta` card, **never** `.btn-primary`, per the receipt-split
invariant). They appear only at these three moments:
1. after the guest adds an expense: "Get notified when friends add expenses";
2. on the add-expense form: "Have a paper receipt? The app reads it for you";
3. after a settlement: "Get a reminder when someone owes you".

Each links to `https://app.ai-budget.pl/?src=group&loc=<moment>&lang=` and adds Google Play as a
secondary link. There is no iOS store link (receipt-split invariant). The plain overview has no
prompt. Nothing is gated behind installing.

## Guest page approach (how it is served)

This is checked in the code: the existing guest page is **server-rendered HTML from the API**. It is
a template-string renderer (`receipt-split/helpers/guest-page.ts`, `pageShell` + `escapeHtml`) with
inline styles, **no `<script>`**, plain `<form method="post">`, and language from `?lang=` or
`Accept-Language` (`resolveGuestLang`). The group page follows the same pattern in
`modules/groups/helpers/group-guest-page.ts` and imports `escapeHtml`. It is served on the API host,
so links are `${APP_PUBLIC_URL || 'https://api.ai-budget.pl'}/g/<token>`, mirroring
`buildGuestUrl`. A pretty apex form would need a `location /g/` nginx block, which is the same open
gap as `/s/` (`docs/ops/receipt-split-rollout.md`). Moving hosts later changes the cookie origin, so
each guest re-identifies once (acceptable, and noted in the runbook).

Why not the Expo web app: a guest has no JWT, and the SPA is a multi-MB bundle with `AccountContextGuard`
assumptions throughout. A no-JS page loads instantly on a cheap phone, which is where these links
get opened.

## Guest → user linking

The member row is the identity, and linking just sets `userId` on it, so the history and balances
carry over with no re-pointing.

1. On the guest page, a cookie-identified guest gets two buttons: "Open in the app" and "Continue in
   the browser app".
2. Either button POSTs `/g/:token/link`. The server mints `code = randomBytes(16).hex`, stores
   `grp:link:{code}` → `{groupId, memberId}` in Redis with a 10-minute TTL, and 303s to a **constant**
   base:
   - web: `https://app.ai-budget.pl/groups/link?code=…&src=group&loc=guest_link`. The acquisition
     capture records `src`/`loc` first-touch, so the signup is attributed.
   - Android "I already have the app": `budget://groups/link?code=…`. The button renders on an
     Android user-agent only. There is no App Links config (trip-wallet known gap).
3. App: `app/groups/link.tsx`. If the user is signed out, the code is stashed (`pendingGroupLink` in
   MMKV / localStorage) and processed after auth through the same cold-start gate as `trip-invite`.
   It lives in a new hook, `src/hooks/useGroupLinkDeepLink.ts`, not inline in `_layout.tsx`. The
   generic `Linking` handler needs an explicit `groups/` exclusion, as `trip-invite/` has.
4. `POST /groups/link-guest {code}` uses atomic `GETDEL`, so the code is single-use. It refuses when
   the member already has a `userId` (410), and when the caller is already a member of the group (409
   `ALREADY_MEMBER`, "you're already in this group as X"). Merging two members is phase 2. Otherwise
   it sets `userId = req.user.id` with `updateMany where userId: null`.

A Play install drops the query string. Documented fallback: after installing, open the group link in
the browser again and tap "Open in the app". An app user who just pastes the group link (`app/groups/join.tsx`)
can take an **unclaimed** placeholder or create a new member. **A claimed guest member can only be
taken over with a link code**, never by picking the name in the app.

## Mobile flow

- Storage: **in-memory, server-only** (`groupStore`). This is a multi-writer ledger in which guests
  write too. Offline writes would need conflict resolution against the settle-up CAS and the
  resolved shares, for little gain, which is the same reasoning `receiptSplitStore`/`tripStore`
  record. When offline, show a banner and disable write buttons. There is no SQLite table and no
  `SyncXxxPayload`, so `dto/sync.ts` is untouched.
- `apps/mobile/src/services/groups.api.ts`, spread into `api.ts` like `tripApi`.
- `apps/mobile/src/stores/groupStore.ts`: `list`, `current: GroupDetail | null`, `activity`, `load`,
  `create`, `join`, `linkGuest`, `addExpense`, `updateExpense`, `deleteExpense`, `settle` (passes
  `ledgerVersion`; on 409 it reloads and shows "balances changed"), `voidSettlement`, members CRUD,
  and `reset()`. The store is not account-scoped, but it must still clear on sign-out
  (`authStore` sign-out list).
- Screens (every one gets a header with title and back):
  - `app/groups/index.tsx`: my groups with my balance; "New group" and "Join with link".
  - `app/groups/new.tsx`: name, emoji, currency (default `user.currencyCode`), member names, and the
    disclosure "Anyone with the link can see this group. Group data is not end-to-end encrypted."
  - `app/groups/[id]/index.tsx`: balance hero ("you're owed / you owe"), the transfers list with a
    "Settle" button per row involving me, the activity list, the share link (copy / share sheet /
    reuse `GroupQrModal` if it is generic enough, otherwise its own QR component), and "your share
    this month".
  - `app/groups/[id]/expense.tsx`: add, and edit through `?expenseId=`. Fields are amount,
    description, date (`DatePicker`), payer, split type and members. A "Scan receipt" button calls
    the existing `POST /ai/scan-receipt` and prefills amount, description and date only (no lines in
    the MVP).
  - `app/groups/[id]/settle.tsx`: confirm a transfer, method, and pay links from the creditor's
    handle.
  - `app/groups/[id]/members.tsx`: add a placeholder, rename, my payment info, remove (zero balance),
    owner controls (rotate link, guest access, archive, delete).
  - `app/groups/join.tsx` (paste a link, or `?t=`) and `app/groups/link.tsx` (`?code=`).
  - Register all of them in the root Stack.
- Components live in `apps/mobile/src/components/groups/`. Split helpers come from
  `src/components/split/` where they apply.
- Entry: a new quick action `groups` in `QUICK_ACTION_KEYS` (default visible). Add it to
  `DEFAULT_VISIBILITY`, the strip, and the settings label map. A migrated persisted order inserts it
  at its position (ABA-189).
- Desktop web (≥1024) is phase 2, routed to `aba-web-designer` → `aba-web-engineer`. In the MVP,
  desktop web renders the phone screens in the content area, which is acceptable but not designed.
- i18n: a `groups` namespace of about 70 keys × 9 locales, landing with each screen commit (a missing
  key renders the key string).

## Admin impact

None in the MVP. Follow-up: groups created, guest members, and guest→user links in investor metrics
(the acquisition-loop KPI).

## Edge cases

- **Two devices claim the same placeholder at once**: `updateMany where claimTokenHash: null`. The
  loser gets "that name was just taken".
- **Owner rotates the link**: all guests are logged out and re-pick their names. A claimed name is
  free again, which is intended.
- **A guest clears cookies**: they use their saved personal link, or the owner taps "reset" (rotate,
  or a phase-2 per-member reset), or they join under a new name. Their name is taken, so "Ania (2)"
  appears. Accepted MVP friction, worded in user_docs.
- **Deleting an expense after a settlement was computed from it**: balances shift, and the old
  settlement stays valid (it is just money moved). Suggested transfers recompute. No lock is needed
  without line claims.
- **Settling a transfer that changed in between**: 409 `LEDGER_CHANGED` / the guest page re-renders
  with "balances changed".
- **Removing a member referenced by history**: soft removal. The history still shows the name, the
  member is excluded from pickers, and their balance must be 0.
- **Owner deletes their user account**: the group cascades away for everyone (MVP gap, written in
  user_docs). Ownership transfer is phase 2.
- **Archived group**: read-only on both surfaces, voids included. `force` archive with debts open is
  allowed, the same as the trip.
- **E2EE user**: groups are outside account E2EE by necessity, because a browser guest must read the
  data. Handled by the creation disclosure, with no tier check.
- **i18n volume**: about 70 mobile keys, about 60 guest-page keys, about 4 push keys, each × 9.
- **Paywall**: none. Abuse is handled by the caps above.
- **Performance**: balances recompute per request over at most 5 000 expenses, using
  `select`-narrowed rows, which is well under 50 ms. There is no cache, so stale-balance bugs cannot
  happen. Activity is cursor-paginated at 50.
- **Bot parity**: not in scope. No `telegram`/`whatsapp`/`slack` handler changes (see Out of scope).
- **Viewer role**: not applicable. Groups are not account data.
- **Infra**: new Redis key-spaces `grp:w:{groupId}` (1 h TTL), `grp:link:{code}` (10 min) and
  `grp:push:{groupId}:{userId}` (10 min). All are TTL'd and tiny. There is no cron, no container
  change and no binary data.

## Security threats and mitigations

| # | Threat | Mitigation |
|---|---|---|
| 1 | Link forwarded or leaked → strangers read names and amounts | This is by design, so it is disclosed at creation. Owner can rotate the link (which also resets claims) or turn `guestAccess` off. `no-referrer`, `no-store`, `noindex` |
| 2 | Token enumeration | 128-bit token, per-IP throttle, byte-identical not-found for unknown / disabled / deleted, two-step lookup |
| 3 | IDOR through any id in a form or route | Group derived from the token (guest) or the guard (app). Every member, expense and settlement id re-scoped `{id, groupId}`. A foreign id is a silent no-op on the guest side and 404 on the app side |
| 4 | Impersonating a member | The acting member comes from the cookie secret (stored hashed) or from `req.user`, **never from a form field**. A claimed member cannot be re-claimed. Takeover in the app needs a link code |
| 5 | CSRF on cookie-authenticated forms | `SameSite=Lax` plus a per-member `csrf` hidden field (timing-safe compare) |
| 6 | XSS through names or descriptions | `escapeHtml` on every interpolation, no `<script>`, strict CSP, plain `Text` rendering in mobile |
| 7 | Public write spam / storage DoS | Per-IP throttles, per-group `incrementWindow` ceiling (fail closed), hard row caps, length caps |
| 8 | Forged "I paid" | Validated against a current suggested transfer before any write. Acting member must be from or to. CAS on `ledgerVersion`. Void by receiver or owner. Visible in history |
| 9 | Guest vandalises the ledger | A guest deletes only expenses they created. Deletes are soft and shown in history. Owner can delete anything from the app |
| 10 | App-user PII leak | Only `displayName` is rendered. Payment handle is per group and set by the member themself (never auto-copied from `user_payment_methods`). No userId, email or accountId |
| 11 | Link-code theft or replay | Minted only for a cookie-identified guest, bound to memberId, 10-minute single-use `GETDEL`, refused if already linked |
| 12 | Open redirect on `/link` | Destination is a constant base and only the code is appended |
| 13 | Secret in URL (`/me/:secret`) logged by nginx | Optional route, throttled. The same exposure class as every existing guest token. Noted for the security audit |
| 14 | Shared device | "Forget this device" clears the cookie and the claim. `HttpOnly` cookie |

## MVP cut vs phase 2

**MVP (this spec):** create, join and share a group. Placeholder and guest members, cookie-claimed
identity. Expenses in equal / exact / percentage / shares (guests: equal and exact). Balances, the
transfers suggested by `simplifyDebts`, and one-tap settle with void. History. Archive, rotate and
delete. Guest → user linking by code. Push `group_activity`. A scan-to-prefill amount in the app. The
three install prompts. Single currency.

**Phase 2:**
- **Line claims**, reusing `resolveItemSplit`/`allocateItemShares`, discount scaling, and the
  remainder-to-payer convention, through `GroupExpenseItem` + `GroupItemClaim {memberId, shareBp?}`
  and a `splitType 'items'`. Deferred because a claim changes shares **after** other people may have
  settled against them. That needs a lock rule (receipt-split locks the whole split once anyone
  claimed or settled), and the right rule for an ongoing ledger is an open question. A no-JS
  checkbox claim form is feasible. The ABA-542 sync trap does not exist here, since items would be
  server-only.
- Multi-currency with a write-time conversion.
- "Count my share in my budget" plus linking a group expense to an existing personal Expense.
- Partial / custom settlement amounts.
- Merging two members.
- Ownership transfer.
- Per-member claim reset.
- Desktop web layout.
- Reminder pushes ("you owe X for 7 days").
- Apex `/g/` nginx block.
- Telegram, WhatsApp and Slack add-to-group.

## Build order

Each step is one commit. Step 2 can run in parallel with step 1.

1. **`aba-backend-engineer`**: `packages/shared-types/src/entities/group.ts` (`ExpenseGroup`,
   `GroupMember`, `GroupExpense`, `GroupSettlement`, `GroupBalance`, `GroupTransfer`) and
   `src/dto/group.ts` (`CreateGroupDto`, `JoinGroupDto`, `LinkGuestDto`, `UpdateGroupDto`,
   `CreateGroupExpenseDto`, `CreateGroupSettlementDto`, `GroupSummary`, `GroupDetail`,
   `GroupActivityPage`), plus the barrel exports. No sync types.
2. **`aba-db-engineer`**: `schema.prisma` models + `User` columns/relations, and migration
   `20261009000000_add_expense_groups`, in the same commit.
3. **`aba-backend-engineer`**: `modules/groups/group-ledger.ts` + `group-ledger.spec.ts`. Pure,
   with no DI.
4. **`aba-backend-engineer`**: `GroupsModule`, the three guards, `GroupsService`, `GroupsController`
   (app routes), and the `group_activity` push + `notification-i18n.ts` × 9, with specs. Register it
   in `app.module.ts`.
5. **`aba-backend-engineer`**: `GroupGuestController` + `group-guest.service.ts` + page renderer +
   guest i18n × 9, plus the `'g/(.*)'` exclusion and the `global-prefix-exclusions.spec.ts`
   extension, with specs. **→ `aba-security` audit before merge.**
6. **`aba-backend-engineer`**: link codes (`POST /g/:token/link`, `POST /groups/link-guest`) with
   specs. It can fold into 5 if small.
7. **`aba-mobile-engineer`**: `groups.api.ts`, `groupStore.ts` (+ sign-out reset) and pure helper
   tests.
8. **`aba-designer` → `aba-mobile-engineer`**: groups list, new and detail screens, with i18n × 9.
9. **`aba-mobile-engineer`**: expense, settle and members screens, with i18n × 9.
10. **`aba-mobile-engineer`**: the join and link routes, `useGroupLinkDeepLink`, the Linking
    exclusion, the `groups` quick action, and the notification-settings toggle, with i18n × 9.
11. **Docs (finish-aba-task)**: `docs/wiki/features/shared-groups.md` + hub link + `log.md`; correct
    the "ONLY unauthenticated surface" line in CLAUDE.md, `receipt-split.md` and the `GuestController`
    docstring (the surfaces are `s/`, `sl/`, `g/`); add `user_docs/<lang>/NN-shared-groups.md` × 9,
    registered in **all three** places (`scripts/generate-help-content.js`, `src/help/sections.ts`,
    `docs/marketing/help/build_help.py`).

## Testing

- **`group-ledger.spec.ts`**: the balances of any mix sum to 0. A settlement nets both `balances` and
  `suggestedTransfers`. A voided settlement and a deleted expense are excluded. The residual cent goes
  to the last member. 4-way and 6-way groups yield ≤ n−1 transfers. A zero-activity member is
  present with 0. Validation of a settle triple within 0.01.
- **`groups.service.spec.ts`**: every foreign id is rejected (payer, share member, from/to, expense,
  settlement from another group). `clientRequestId` P2002 returns the existing row. A CAS mismatch
  returns 409. Caps. Currency is locked after the first expense. Remove / leave with a non-zero
  balance returns 409. Rotation clears claims. The archived guard. `link-guest` is single-use,
  expires, and handles already-linked / already-member. Push coalescing and the pref gate.
- **`group-guest.controller.spec.ts`**: byte-identical not-found for unknown, `guestAccess=false` and
  deleted. The claim race (second claimer loses). Writes without a cookie are refused. A CSRF
  mismatch is refused. A foreign `memberId`/`expenseId` is a no-op. A guest cannot delete another
  member's expense. All headers (CSP, `noindex`, `no-store`, `no-referrer`). Every POST is a 303 PRG.
  A planted sentinel email/userId/accountId never appears in the HTML. `escapeHtml` on a hostile
  name. The CTA uses `.btn-cta`, never `.btn-primary`. No iOS store link.
- **`global-prefix-exclusions.spec.ts`**: reflects over `GroupGuestController` routes.
- **Mobile**: pure helpers (balance copy, share-form validation mirroring `validateTripSplit`) and
  the store's 409 → reload path.
- **Manual, required, not automatable**: on a real device and in browsers, the owner creates a group
  with 3 placeholders; three guests on Android Chrome, iOS Safari and desktop Firefox each claim a
  name, add expenses and settle; the owner sees the push; one guest signs up through "Continue in the
  browser app" and lands linked with their history; rotate the link and confirm everyone has to
  re-identify; test with the system dark mode on and a 320px-wide screen.

## Required pre-merge reviews

- `aba-security` audit: **Required.** It is a new unauthenticated surface with public writes, a new
  cookie-based guest identity, CSRF handling, the bearer-token link, the link-code account binding,
  and payment handles rendered to the public. Audit step 5 and step 6.
- `aba-devops-engineer` review: **Required (light).** It adds three new TTL'd Redis key-spaces
  (`grp:w:*`, `grp:link:*`, `grp:push:*`) and confirms that `incrementWindow`'s fail-closed
  behaviour is acceptable for guest writes. The optional apex `location /g/` nginx block is a
  follow-up alongside `/s/`. There are no cron, container or memory changes.

## Follow-ups

- Phase 2 list above. Line claims first: it is the explicit ask, and the next acquisition hook.
- Lift `escapeHtml`, the lang resolver and `buildGuestPayLink` into `common/guest-page/` once three
  guest controllers share them.
- Admin and investor metrics for the group loop.
- An apex nginx `/g/` and `/s/` block with `APP_PUBLIC_URL` (runbook `docs/ops/receipt-split-rollout.md`).

## Out of scope

- Any `Expense`/`Income` write from the group ledger.
- Bot channels (Telegram, WhatsApp, Slack) for groups. Parity is deferred as a whole, not per bot.
- Converting an existing receipt split or trip into a group.
- Email invites, and accounts for guests.
- The JSON variant of the guest routes.
- iOS store links.
- Group chat or comments.
