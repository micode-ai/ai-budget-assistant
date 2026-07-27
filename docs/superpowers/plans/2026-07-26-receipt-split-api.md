# Receipt Split via Guest Link — API Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the payer split a scanned receipt by line item and hand each participant a public link showing only their own share, with a ready-to-pay button — no account required on the receiving side.

**Architecture:** One new table holds the link and its state; the receivable itself reuses the existing debt mechanism (`isDebt` expenses), so reminders, one-tap settle and the AI debt tools work unchanged. A pure calculator does the arithmetic. Two public unauthenticated routes serve the guest page and accept a single "I paid" claim.

**Tech Stack:** NestJS 10, Prisma 5, Jest. No new dependencies.

Spec: `docs/superpowers/specs/2026-07-24-receipt-split-guest-link-design.md`
Plan 2 (mobile) comes after this one: the split screen, the status view, the entry point, and `receiptSplit.*` in 9 locales.

## Global Constraints

- **The original receipt expense stays whole.** Only split-generated debt rows are excluded from consumption totals, via a new explicit `isSplitReceivable` marker. **Standalone debts must behave exactly as they do today** — no data migration, and no change to any existing user's historical figures. A blanket "exclude all `isDebt`" would break a plain cash loan, where the debt row *is* the outflow.
- **Never sum or convert currencies.** One split = the receipt's currency. No FX anywhere.
- **The guest page leaks nothing.** It returns only: merchant, date, the payer's display name, the guest's *own* items, their amount and currency, and the payment link. Never `accountId`, never another participant's amount, never other line items, never the receipt image, never an email.
- **An unknown token and an expired token produce the same response.** No enumeration signal.
- **Token entropy is 128 bits** (`randomBytes(16).toString('hex')`). Do **not** copy the 8-character hex invitation-code pattern — 32 bits is brute-forceable for a public, payment-adjacent page.
- **E2EE (tier-2) accounts are rejected** for splitting: items and merchant are encrypted at rest, so the server cannot populate a guest page.
- `apps/api` must never import runtime values from `@budget/shared-types`/`shared-utils` — `import type` only.
- All HTML interpolation goes through `escapeHtml`.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | `ReceiptSplitParticipant` model; `Expense.isSplitReceivable`; `User.paymentMethod`/`paymentHandle` |
| `packages/shared-types/src/dto/receipt-split.ts` | **create** — request/response DTOs |
| `apps/api/src/modules/receipt-split/split-calculator.ts` | **create** — pure `resolveItemSplit` |
| `apps/api/src/modules/receipt-split/receipt-split.service.ts` | **create** — create/get/confirm/cancel |
| `apps/api/src/modules/receipt-split/receipt-split.controller.ts` | **create** — authenticated routes |
| `apps/api/src/modules/receipt-split/guest.controller.ts` | **create** — the two public routes |
| `apps/api/src/modules/receipt-split/helpers/guest-page.ts` | **create** — server-rendered HTML |
| `apps/api/src/modules/receipt-split/helpers/guest-page-i18n.ts` | **create** — 9-language strings |
| `apps/api/src/main.ts` | add the public routes to the `setGlobalPrefix` exclude list |
| `apps/api/src/modules/expenses/expenses.service.ts` | soft-delete cleanup in `remove` |

---

### Task 1: Schema and types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_receipt_split/migration.sql`
- Create: `packages/shared-types/src/dto/receipt-split.ts`
- Modify: `packages/shared-types/src/dto/index.ts`
- Modify: `packages/shared-types/src/entities/expense.ts` (add `isSplitReceivable`)

**Interfaces:**
- Produces: the `ReceiptSplitParticipant` model; `Expense.isSplitReceivable: boolean`; `User.paymentMethod`/`paymentHandle`; and the DTOs `CreateSplitDto`, `SplitParticipantInput`, `SplitStateResponse`, `SplitParticipantState`, `GuestSplitView`.

- [ ] **Step 1: Add the model and columns**

In `apps/api/prisma/schema.prisma`:

```prisma
model ReceiptSplitParticipant {
  id            String    @id @default(uuid())
  accountId     String    @map("account_id")
  expenseId     String    @map("expense_id")
  name          String
  token         String    @unique
  amount        Decimal   @db.Decimal(12, 2)
  currencyCode  String    @map("currency_code")
  itemIds       Json?     @map("item_ids")
  debtExpenseId String?   @map("debt_expense_id")
  openedAt      DateTime? @map("opened_at")
  claimedAt     DateTime? @map("claimed_at")
  settledAt     DateTime? @map("settled_at")
  expiresAt     DateTime  @map("expires_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  expense Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)

  @@index([expenseId])
  @@map("receipt_split_participants")
}
```

On `Expense`, add `isSplitReceivable Boolean @default(false) @map("is_split_receivable")` and the back-relation `splitParticipants ReceiptSplitParticipant[]`.

On `User`, add `paymentMethod SettleMethod?` and `paymentHandle String? @map("payment_handle")`. Reuse the existing `SettleMethod` enum (it already exists for trip settle-up) — do not define a second one.

- [ ] **Step 2: Author the migration without a database**

This repo runs migrations against prod from the deploy `migrator` and has **no local database**, so `prisma migrate dev` is not available. Generate the SQL by diffing:

```bash
cd apps/api
# Diff the schema as it was BEFORE this task against the edited one. Both sides
# are datamodels, so this needs no database at all.
git show HEAD:apps/api/prisma/schema.prisma > /tmp/schema-before.prisma
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema-before.prisma \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > /tmp/split.sql
```

Do **not** use `--from-migrations`: replaying the migration history requires a shadow database (`--shadow-database-url`), and this repo has none.

Create `prisma/migrations/<UTC-timestamp>_add_receipt_split/migration.sql` with that output, following the timestamp format of the neighbouring migration directories. Read the generated SQL before committing it — confirm it only *adds* (a table, two columns on `users`, one on `expenses`, one index, one FK) and contains no `DROP` or destructive `ALTER`. If it does, stop and report.

Then `npx prisma generate`.

- [ ] **Step 3: Add the DTOs**

Create `packages/shared-types/src/dto/receipt-split.ts`:

```ts
/** One participant the payer is asking to settle up. */
export interface SplitParticipantInput {
  name: string;
  /** Ids of the expense_items assigned to this person. Empty = an equal-split share. */
  itemIds?: string[];
}

export interface CreateSplitDto {
  participants: SplitParticipantInput[];
  /** 'items' assigns line items; 'equal' divides the whole bill among payer + participants. */
  mode: 'items' | 'equal';
}

export type SplitParticipantStatus = 'sent' | 'opened' | 'claimed' | 'settled';

export interface SplitParticipantState {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  status: SplitParticipantStatus;
  /** The shareable URL. Present only to the payer, never on the guest page. */
  url: string;
}

export interface SplitStateResponse {
  expenseId: string;
  /** The payer's own remainder — bill total minus the sum of participant shares. */
  ownShare: number;
  currencyCode: string;
  participants: SplitParticipantState[];
}

/** Exactly what a guest may see. Deliberately omits every other participant. */
export interface GuestSplitView {
  merchant: string | null;
  date: string | null;
  payerName: string;
  yourName: string;
  amount: number;
  currencyCode: string;
  items: { description: string; totalPrice: number }[];
  paymentMethod: string | null;
  paymentHandle: string | null;
  paymentLink: string | null;
  alreadyClaimed: boolean;
}
```

Export it from `packages/shared-types/src/dto/index.ts`, and add `isSplitReceivable: boolean` to the `Expense` entity.

- [ ] **Step 4: Verify**

Run: `cd apps/api && npx prisma validate && npx prisma generate` then `npm run typecheck` from the repo root.
Expected: both pass; the workspace typecheck is currently fully clean, so any error is yours.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma packages/shared-types
git commit -m "feat(receipt-split): add the participant table, receivable marker and DTOs"
```

---

### Task 2: The pure calculator

**Files:**
- Create: `apps/api/src/modules/receipt-split/split-calculator.ts`
- Test: `apps/api/src/modules/receipt-split/split-calculator.spec.ts`

**Interfaces:**
- Produces: `resolveItemSplit(items, assignments, billTotal)` and `resolveEqualSplit(participantIds, billTotal)`, both → `{ shares: { participantId: string; amount: number }[]; ownShare: number }`. `CreateSplitDto.mode` selects between them: `'items'` for a scanned receipt with line items, `'equal'` for a manually entered expense that has none.

**Rules, all of which need a test:**
- An item assigned to N participants is divided equally among them.
- An item nobody claimed stays with the payer.
- The rounding remainder goes to the **payer**, never to a participant — nobody should be asked for a cent more than their arithmetic share.
- `ownShare` = `billTotal − Σ shares`, so the numbers always close against the bill.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/receipt-split/split-calculator.spec.ts`:

```ts
import { resolveItemSplit, resolveEqualSplit } from './split-calculator';

const item = (id: string, totalPrice: number) => ({ id, totalPrice });

describe('resolveItemSplit', () => {
  it('assigns a whole item to its single claimant', () => {
    const out = resolveItemSplit([item('i1', 30)], [{ participantId: 'p1', itemIds: ['i1'] }], 30);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
    expect(out.ownShare).toBe(0);
  });

  it('splits a shared item equally between its claimants', () => {
    const out = resolveItemSplit(
      [item('wine', 60)],
      [
        { participantId: 'p1', itemIds: ['wine'] },
        { participantId: 'p2', itemIds: ['wine'] },
      ],
      60,
    );
    expect(out.shares).toEqual([
      { participantId: 'p1', amount: 30 },
      { participantId: 'p2', amount: 30 },
    ]);
  });

  it('leaves unclaimed items with the payer', () => {
    const out = resolveItemSplit(
      [item('i1', 30), item('i2', 20)],
      [{ participantId: 'p1', itemIds: ['i1'] }],
      50,
    );
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 30 }]);
    expect(out.ownShare).toBe(20);
  });

  it('gives the rounding remainder to the payer, not a participant', () => {
    // 10.00 split three ways is 3.333…; each participant is charged 3.33 and the
    // payer absorbs the extra cent.
    const out = resolveItemSplit(
      [item('i1', 10)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p2', itemIds: ['i1'] },
        { participantId: 'p3', itemIds: ['i1'] },
      ],
      10,
    );
    expect(out.shares.map((s) => s.amount)).toEqual([3.33, 3.33, 3.33]);
    expect(out.ownShare).toBe(0.01);
  });

  it('always closes against the bill total', () => {
    const out = resolveItemSplit(
      [item('i1', 33.33), item('i2', 33.33), item('i3', 33.34)],
      [
        { participantId: 'p1', itemIds: ['i1'] },
        { participantId: 'p2', itemIds: ['i2'] },
      ],
      100,
    );
    const sum = out.shares.reduce((a, s) => a + s.amount, 0) + out.ownShare;
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('ignores an assignment referring to an unknown item id', () => {
    const out = resolveItemSplit([item('i1', 30)], [{ participantId: 'p1', itemIds: ['ghost'] }], 30);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 0 }]);
    expect(out.ownShare).toBe(30);
  });
});

describe('resolveEqualSplit', () => {
  it('divides the bill among the participants and the payer', () => {
    const out = resolveEqualSplit(['p1', 'p2', 'p3'], 100);
    expect(out.shares.map((s) => s.amount)).toEqual([25, 25, 25]);
    expect(out.ownShare).toBe(25);
  });

  it('gives the rounding remainder to the payer', () => {
    // 10.00 across three participants + the payer is 2.50 each — but 10.00 across
    // two participants + the payer is 3.333…, so the payer absorbs the cent.
    const out = resolveEqualSplit(['p1', 'p2'], 10);
    expect(out.shares.map((s) => s.amount)).toEqual([3.33, 3.33]);
    expect(out.ownShare).toBe(3.34);
  });

  it('handles a single participant', () => {
    const out = resolveEqualSplit(['p1'], 7);
    expect(out.shares).toEqual([{ participantId: 'p1', amount: 3.5 }]);
    expect(out.ownShare).toBe(3.5);
  });
});
```

**`resolveEqualSplit(participantIds, billTotal)`** is the second exported function, for a bill with no line items (a manually entered expense). It divides among the participants **plus the payer** — the payer is one of the diners, not an extra — and the payer again absorbs the remainder. Do not reach for the trip module's `resolveShares` here: that one puts the residual cent on the *last entry*, which would only land on the payer if a caller remembered to pass them last, and a rule that depends on argument order is a rule waiting to be broken.

- [ ] **Step 2: Run and confirm they fail**

Run: `cd apps/api && npx jest split-calculator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `split-calculator.ts` — pure, no IO, no clock. Sum each participant's assigned items (dividing a shared item by its number of claimants), round each participant's total **down** to the cent, and give the payer `billTotal − Σ participants`. Rounding down is what keeps the remainder with the payer.

- [ ] **Step 4: Run and confirm they pass**

Run: `cd apps/api && npx jest split-calculator`
Expected: PASS, 9 tests (6 for resolveItemSplit, 3 for resolveEqualSplit).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/receipt-split
git commit -m "feat(receipt-split): add the pure item-split calculator"
```

---

### Task 3: Keep split receivables out of consumption totals (server side)

**Files:**
- Modify: `apps/api/src/modules/analytics/analytics.service.ts`
- Modify: `apps/api/src/modules/insights/safe-to-spend.service.ts`
- Modify: `apps/api/src/modules/budgets/budget-alert.service.ts`
- Test: the matching spec for each

**Interfaces:**
- Consumes: `Expense.isSplitReceivable` (Task 1).
- Produces: nothing new — three query filters.

**Why, precisely.** A 200 bill split with three guests at 50 creates three debt rows of 50. Those rows are bookkeeping of a receivable; the money already left the account as the 200 receipt. Counting both would report 350 of spending for one dinner.

**Why the filter is narrow.** "Exclude all `isDebt`" is wrong: for a standalone cash loan the debt row **is** the outflow. Only rows carrying `isSplitReceivable` may be excluded — which is also why this change cannot alter any existing user's numbers, since nothing sets that column yet.

- [ ] **Step 1: Write a failing test for each service**

For each of the three, add a test asserting that an expense with `isSplitReceivable: true` is excluded from the spend aggregation **while a plain `isDebt: true` expense is still counted**. The second half is the load-bearing half — it is the regression guard against someone "simplifying" the filter to `isDebt` and silently breaking every user who tracks cash loans.

These services aggregate through Prisma, so assert on the `where` clause that was actually sent. Shape (adapt to each spec's fixtures):

```ts
it('excludes split receivables from spend but still counts a standalone debt', async () => {
  prisma.expense.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: 0 } });

  await service.getSummary('acc-1', /* …the args this service takes… */);

  const where = (prisma.expense.aggregate as jest.Mock).mock.calls[0][0].where;
  // The marker the split feature sets — must be filtered out.
  expect(where.isSplitReceivable).toBe(false);
  // But NOT isDebt: for a standalone cash loan the debt row IS the outflow, so
  // filtering on it would rewrite the numbers of every user tracking debts.
  expect(where.isDebt).toBeUndefined();
});
```

Follow each spec file's existing mocking style; if a service uses `groupBy` or `findMany` instead of `aggregate`, assert on that call instead.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd apps/api && npx jest analytics.service safe-to-spend budget-alert`
Expected: the three new tests FAIL.

- [ ] **Step 3: Add the filter**

Add `isSplitReceivable: false` to the expense `where` clause of each spend aggregation. Do **not** touch the wallet-balance or net-worth paths: money genuinely left the account, so cash-flow surfaces keep counting the receipt (and the repayment income when it arrives).

- [ ] **Step 4: Run the suites**

Run: `cd apps/api && npx jest analytics.service safe-to-spend budget-alert`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analytics apps/api/src/modules/insights apps/api/src/modules/budgets
git commit -m "feat(receipt-split): exclude split receivables from consumption totals"
```

---

### Task 4: The service and the payer's endpoints

**Files:**
- Create: `apps/api/src/modules/receipt-split/receipt-split.service.ts`
- Create: `apps/api/src/modules/receipt-split/receipt-split.controller.ts`
- Create: `apps/api/src/modules/receipt-split/receipt-split.module.ts`
- Create: `apps/api/src/modules/receipt-split/dto/index.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts` (`remove`, around `:629`)
- Test: `apps/api/src/modules/receipt-split/receipt-split.service.spec.ts`

**Interfaces:**
- Consumes: `resolveItemSplit` (Task 2); `DebtsService.recordRepayment(accountId, userId, debtId, amount, date?)`.
- Produces: `POST/GET/DELETE /expenses/:id/split` and `PATCH /expenses/:id/split/:participantId/confirm`.

**Guards:** `JwtAuthGuard + AccountContextGuard + ViewerBlockGuard + TripArchivedGuard`, matching how `expenses.controller.ts` guards its other write routes.

- [ ] **Step 1: Write the failing service tests**

Cover, each as its own test:
- **create** writes one participant row per person plus one `isDebt` + `isSplitReceivable` expense per person, in a single `$transaction`, with `debtContactName` set to the participant's name
- **create is idempotent**: called twice for the same expense it returns the existing split rather than minting a second set of tokens
- **validation rejects, before any write**: `Σ shares > bill` (0.01 tolerance), zero participants, more than 20, a blank name, an `amount <= 0`, and an `itemIds` entry belonging to a different expense
- **an E2EE (tier-2) account is rejected** with `BadRequestException`
- **tokens are 32 hex characters** and two participants never share one
- **confirm** delegates to `DebtsService.recordRepayment` and stamps `settledAt`; a second confirm is rejected so no duplicate repayment income is created
- **cancel** soft-deletes the debt rows and expires the participants

- [ ] **Step 2: Run and confirm they fail**

Run: `cd apps/api && npx jest receipt-split`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Key points, all load-bearing:

- Token: `randomBytes(16).toString('hex')`.
- `expiresAt`: `now + 30 days`.
- Idempotency follows the ABA-316 pattern — pre-check for an existing split, and catch a concurrent-race `P2002` **outside** the `$transaction`, because Postgres poisons a transaction after a constraint violation (ABA-313).
- All validation runs **before** the transaction opens.
- The payer's own share is never a participant row: it is `billTotal − Σ participants`, computed on read.

- [ ] **Step 4: Add the controller and module, and register it**

Routes: `POST /expenses/:id/split`, `GET /expenses/:id/split`, `PATCH /expenses/:id/split/:participantId/confirm`, `DELETE /expenses/:id/split`. Each new path has a static segment after `:id`, so no shadowing — but keep them after the existing `PATCH /expenses/bulk` and `POST /expenses/merge` declarations, because Express matches in declaration order and this codebase has been bitten by that twice (ABA-166).

Import the module in `app.module.ts`. `ReceiptSplitModule` needs `DebtsModule`; check for a cycle before wiring and report what you found.

- [ ] **Step 5: Handle the payer deleting the receipt**

`ExpensesService.remove` (`expenses.service.ts:629`) soft-deletes by setting `isDeleted`, which does **not** fire the Prisma `onDelete: Cascade`. So it must explicitly soft-delete the split's debt rows and expire its participants — otherwise guest links stay live for a receipt that no longer exists. Add that alongside the existing `dismissForExpense` fire-and-forget, following the same `void`-and-never-throw shape. Add a test.

- [ ] **Step 6: Run the suites and typecheck**

Run: `cd apps/api && npx jest receipt-split expenses.service && cd ../.. && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/receipt-split apps/api/src/app.module.ts apps/api/src/modules/expenses/expenses.service.ts
git commit -m "feat(receipt-split): create splits, confirm repayments, clean up on delete"
```

---

### Task 5: The payer's payment handle

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts` and its DTO
- Modify: `apps/api/src/modules/auth/auth.service.ts` (the five response `user` blocks)
- Test: `apps/api/src/modules/users/users.controller.spec.ts`

**Interfaces:**
- Consumes: `User.paymentMethod`/`paymentHandle` (Task 1).
- Produces: both fields readable and writable through `GET`/`PATCH /users/me`, and present in every auth response's `user` object.

**Why this exists.** `paymentMethod`/`paymentHandle` currently live on `AccountMember`, i.e. scoped to a trip account. A split happens in personal accounts too, where no such row carries a handle. Resolution order for a split: the user-level handle first, then the account-member handle as a fallback.

- [ ] **Step 1: Write the failing tests**

Assert that `PATCH /users/me` accepts a valid handle and rejects a malformed one. Reuse the existing allow-list regex from the trip settle-up DTO — `/^[A-Za-z0-9+ ._-]{1,50}$/`, where `+` and space are deliberately allowed for BLIK phone-number handles. Also assert `paymentMethod` only accepts the `SettleMethod` values.

- [ ] **Step 2: Run, implement, run**

Run `cd apps/api && npx jest users` before and after. Mirror how `currencyCode` is handled in the same service, and remember all five auth-response `user` blocks — a field returned by `getProfile` but missing from the login response is a class of bug this codebase has hit before.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users apps/api/src/modules/auth
git commit -m "feat(users): store a payment handle on the user, not just the trip member"
```

---

### Task 6: The public guest page

**Files:**
- Create: `apps/api/src/modules/receipt-split/guest.controller.ts`
- Create: `apps/api/src/modules/receipt-split/helpers/guest-page.ts`
- Create: `apps/api/src/modules/receipt-split/helpers/guest-page-i18n.ts`
- Modify: `apps/api/src/main.ts` (the `setGlobalPrefix` exclude list, line ~32)
- Test: `apps/api/src/modules/receipt-split/guest.controller.spec.ts`

**Interfaces:**
- Consumes: the service from Task 4, the user handle from Task 5.
- Produces: `GET /s/:token` (HTML) and `POST /s/:token/paid`.

**Only these two routes.** A JSON variant is deliberately not shipped: nothing consumes it, and an unused public read endpoint is attack surface for free.

- [ ] **Step 1: Write the failing tests**

- `GET /s/:token` needs **no** authentication
- an unknown token and an expired token return the **same** response — this one gets written as an explicit equality assertion, because "they look similar" is exactly how an enumeration signal creeps back in:

```ts
it('answers an unknown token and an expired token identically', async () => {
  prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue(null);
  const unknown = await controller.guestPage('0'.repeat(32), {} as any);

  prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue({
    ...participantFixture,
    expiresAt: new Date('2000-01-01'),
  });
  const expired = await controller.guestPage('1'.repeat(32), {} as any);

  // Byte-identical: no status code, wording, or length difference may let a
  // caller distinguish "no such link" from "this link has expired".
  expect(expired).toBe(unknown);
});
```

- the response contains the guest's own amount and **not** any other participant's name or amount, nor the `accountId`
- the first `GET` stamps `openedAt`; a second `GET` does not overwrite it
- `POST /s/:token/paid` is idempotent — a second call leaves `claimedAt` unchanged and does not create a second notification
- a name containing `<script>` is escaped in the HTML

- [ ] **Step 2: Run, implement, run**

The HTML follows `apps/api/src/modules/slack/helpers/oauth-pages.ts` structurally — a single self-contained document, inline styles, everything through `escapeHtml`. Content: merchant and date, "«Payer» paid for everyone", the guest's items, their amount in large type, a pay button (BLIK instructions, or a `revolut.me` / `paypal.me` deep link built with `encodeURIComponent`, mirroring `trip-settle-up.service.ts:177`), an "I paid" button, and store links at the bottom.

Language: `?lang=` from the shared link first (the payer shares in their own language), then `Accept-Language`, then English. Put the strings in `guest-page-i18n.ts`, structured like `notifications/notification-i18n.ts`, covering the same 9 languages the mobile app supports.

Add both paths to the `exclude` array in `main.ts` so they sit outside the `/api/v1` prefix, and apply `@Throttle` to both, following `GET /users/search` (the existing consumer of the globally-configured `ThrottlerGuard`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/receipt-split apps/api/src/main.ts
git commit -m "feat(receipt-split): serve the public guest page and accept an I-paid claim"
```

---

### Task 7: Tell the payer when a guest claims payment

**Files:**
- Modify: `packages/shared-types` (`NotificationType`)
- Modify: `apps/api/src/modules/notifications/notification-i18n.ts`
- Modify: `apps/api/src/modules/receipt-split/receipt-split.service.ts`
- Test: `apps/api/src/modules/receipt-split/receipt-split.service.spec.ts`

**Interfaces:**
- Consumes: the claim path from Task 6.
- Produces: a `split_payment_claimed` push.

- [ ] **Step 1: Implement with a test**

Add the type, add title/body in all 9 languages, and send it from the claim path. **No preference toggle** — same reasoning as `account_invitation`: this is a one-off action request, not a recurring background alert, and every other type's toggle exists for the latter. Assert in a test that the push is sent once per claim and not at all on a repeat claim.

- [ ] **Step 2: Commit**

```bash
git add packages/shared-types apps/api/src/modules/notifications apps/api/src/modules/receipt-split
git commit -m "feat(notifications): push to the payer when a guest says they paid"
```

---

## Done when

- `cd apps/api && npx jest receipt-split split-calculator expenses.service analytics.service safe-to-spend budget-alert users` is green.
- `npm run typecheck` is clean at the repo root (it currently is — keep it that way).
- The generated migration adds only the new table, the four new columns, one index and one FK; no `DROP`, no destructive `ALTER`.
- A split of a 200 bill among three guests leaves the account's counted spending at 200, while a standalone "lent 500 in cash" debt still counts as spending.
- An unknown token and an expired token are byte-identical in response.

## Known pre-existing breakage — not this plan's to fix

Verified before this plan started: mobile Jest emits a "worker process failed to exit gracefully" warning (an unreleased timer somewhere). Everything else in the repo is currently green — API suites, all 9 locales, the workspace typecheck, mobile 36/36. If something outside this feature fails, it is likely yours.

## Deploy note

The pretty guest URL needs one `location /s/ { proxy_pass … }` block in `shared-nginx` on the VPS. That config lives on the server, not in this repo, so **it does not deploy with the code** — until it is added the links resolve only as `api.ai-budget.pl/s/<token>`, which works but puts an `api.` host in a message about money. Plan 2 ends with a runbook covering this.
