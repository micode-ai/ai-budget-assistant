# Receipt Split via Guest Link — Mobile Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the payer split a scanned receipt by line item from the app, send each diner their link, and watch the shares settle — and make the client's own numbers agree with the server's while doing it.

**Architecture:** The API half is built and reviewed. This plan adds the consumption filter mobile computes for itself, a server-only store, one screen that doubles as the status view, and an entry point. It also closes the one defect deliberately deferred from Plan 1, because this plan is what makes it reachable.

**Tech Stack:** Expo 54 / React Native 0.81, Zustand, SQLite (raw `executeSql`), i18next (9 locales), NestJS 10 for the deferred fix.

Plan 1: `docs/superpowers/plans/2026-07-26-receipt-split-api.md` (merged, 21 commits)
Spec: `docs/superpowers/specs/2026-07-24-receipt-split-guest-link-design.md`

## Global Constraints

- **Never sum or convert currencies.** One split is one currency; the client never converts.
- **The payer absorbs the rounding remainder**, never a participant. The server computes this; the client must not re-derive shares independently, or the two will disagree by a cent.
- **`isSplitReceivable` rows are excluded from consumption, never from cash flow.** Excluding them from a *balance* would be a different wrong number. Filter on that marker alone — **never on `isDebt`** — because for a standalone cash loan the debt row *is* the outflow.
- **Absent means false.** The column is nullable on the client; filter with `!e.isSplitReceivable`, never `=== false`.
- **All 9 locales** move together: `en, de, es, fr, pl, ru, ua, be, nl`.
- Split creation is an **online action** — the server mints the tokens. Follow `moveExpense`, not the offline-first queue.
- No accusatory copy anywhere: a guest who has not paid is not late, they simply have not paid yet.

## Execution order — one dependency breaks the numbering

Tasks run in order **except that Task 7 must be finished before Task 5's cancel affordance is built.** Until Task 7 lands, cancelling a split makes that receipt permanently un-splittable, so shipping a cancel button first would hand users a one-way door.

Either do Task 7 immediately after Task 4, or build all of Task 5 except the cancel button and come back for it. Whichever you choose, say which in your report — do not silently ship a cancel that cannot be undone.

## What Plan 1 left for this plan

| Item | Where it lands |
|---|---|
| Mobile has no `is_split_receivable` column, so client-computed analytics, budgets and home totals do not apply the exclusion — server and client would disagree for any split | Task 1 |
| Cancel-then-re-split collides on the debt expense's deterministic client id | Task 7 |
| The pretty guest URL needs a manual nginx block that does not exist | Task 8 |
| No CLAUDE.md section, no ABA issue | Task 8 |

Deferred **past** this plan, recorded so they are not lost: editing a bill after splitting leaves a negative `ownShare` with no clamp or stale flag; confirming a participant whose debt row was manually deleted returns a 500; cancelling after a confirm orphans the repayment income.

---

### Task 1: The client-side consumption filter

**Files:**
- Modify: `apps/mobile/src/db/client.native.ts` (the `expenses` CREATE TABLE, plus an `ALTER TABLE` for existing installs)
- Modify: `apps/mobile/src/db/expenseRepository.ts` (row type, mapper, insert/upsert column lists)
- Modify: `apps/mobile/src/stores/expenseSync.ts` (carry the field through the pull merge)
- Create: `apps/mobile/src/utils/consumption.ts`
- Create: `apps/mobile/src/utils/__tests__/consumption.test.ts`
- Modify: `apps/mobile/src/features/analytics/useFilteredTransactions.ts:15`
- Modify: `apps/mobile/src/stores/budgetStore.ts:449`

**Interfaces:**
- Produces: `filterConsumption(expenses: Expense[]): Expense[]`.

**Why only two call sites.** `useFilteredTransactions` is the single funnel every analytics sub-hook draws from, and the home screen's spend total comes from `monthlyBudgetSummary.totalSpent`, which `budgetStore` computes. Those two cover every client-side consumption surface. Verify that is still true before you start — if a third has appeared, filter it too and say so.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/utils/__tests__/consumption.test.ts`:

```ts
import { filterConsumption } from '../consumption';

const expense = (over: Partial<any> = {}): any => ({
  id: 'e1',
  amount: 100,
  isDeleted: false,
  ...over,
});

describe('filterConsumption', () => {
  it('keeps an ordinary expense', () => {
    expect(filterConsumption([expense()])).toHaveLength(1);
  });

  it('drops a split receivable', () => {
    expect(filterConsumption([expense({ isSplitReceivable: true })])).toHaveLength(0);
  });

  it('KEEPS a standalone cash debt — the debt row IS the outflow there', () => {
    // The regression guard. Filtering on isDebt instead would silently rewrite
    // the numbers of every user who lends money in cash.
    expect(filterConsumption([expense({ isDebt: true })])).toHaveLength(1);
  });

  it('treats an absent marker as false', () => {
    // The column is nullable on the client, so most rows arrive without it.
    expect(filterConsumption([expense({ isSplitReceivable: undefined })])).toHaveLength(1);
    expect(filterConsumption([expense({ isSplitReceivable: null as any })])).toHaveLength(1);
  });

  it('a 200 bill split three ways still totals 200 of spending', () => {
    const rows = [
      expense({ id: 'receipt', amount: 200 }),
      expense({ id: 'd1', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd2', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd3', amount: 50, isDebt: true, isSplitReceivable: true }),
    ];
    const total = filterConsumption(rows).reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(200);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/mobile && npx jest consumption`
Expected: FAIL — cannot resolve `../consumption`.

- [ ] **Step 3: Implement**

```ts
import type { Expense } from '@budget/shared-types';

/**
 * Drop rows that are bookkeeping of a receivable rather than consumption.
 *
 * Splitting a 200 bill among three guests creates the 200 receipt PLUS three 50
 * debt rows. The money already left as the receipt, so counting both reports 350
 * of spending for one dinner.
 *
 * Filter on `isSplitReceivable` ONLY, never `isDebt`: for a standalone cash loan
 * the debt row IS the outflow, and excluding it would rewrite the numbers of
 * every user who tracks debts. Absent means false — the column is nullable on
 * the client, so most rows arrive without it.
 *
 * Consumption surfaces only. Wallet balances and net worth keep counting these
 * rows, because the money really did leave the account.
 */
export function filterConsumption(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isSplitReceivable);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd apps/mobile && npx jest consumption`
Expected: PASS, 5 tests.

- [ ] **Step 5: Carry the column through SQLite**

Add `is_split_receivable INTEGER DEFAULT 0` to the `expenses` CREATE TABLE, and an `ALTER TABLE expenses ADD COLUMN is_split_receivable INTEGER` alongside the other one-off ALTERs — follow exactly how `is_planned` was added, including that the ALTER runs unconditionally in a try/catch so fresh installs get it too. Then thread it through `expenseRepository`'s row type, its `mapRow`, and every insert/upsert column list, and through the pull merge in `expenseSync.ts` so a server row's value reaches the local table.

Mirror `isPlanned` at each site. Getting the column into SQLite but forgetting the pull merge is the failure mode here — the filter would then work only for rows created on this device.

- [ ] **Step 6: Wire the two call sites**

`useFilteredTransactions.ts:15` and `budgetStore.ts:449`. Apply `filterConsumption` where the raw store array is first read, so every downstream computation inherits it.

- [ ] **Step 7: Verify and commit**

Run: `cd apps/mobile && npx jest && npx tsc --noEmit -p tsconfig.json`
Expected: the mobile baseline (36 files, 292 tests) plus your additions, and a clean typecheck.

```bash
git add apps/mobile/src/utils/consumption.ts apps/mobile/src/utils/__tests__/consumption.test.ts apps/mobile/src/db apps/mobile/src/stores/expenseSync.ts apps/mobile/src/stores/budgetStore.ts apps/mobile/src/features/analytics/useFilteredTransactions.ts
git commit -m "feat(mobile): keep split receivables out of client-computed spend"
```

---

### Task 2: Strings in all 9 locales

**Files:** `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be,nl}.ts`

**Interfaces:**
- Produces: the `receiptSplit.*` namespace every later task renders.

- [ ] **Step 1: Add the English keys**

```ts
  receiptSplit: {
    title: 'Split this receipt',
    entryAction: 'Split',
    addPerson: 'Add person',
    personName: 'Name',
    yourShare: 'Your share',
    assignHint: 'Tap an item, then tap who had it',
    equalMode: 'Split equally',
    equalHint: 'This expense has no line items, so it will be divided equally.',
    createSplit: 'Create links',
    shareWith: 'Send to {{name}}',
    copyAll: 'Copy all links',
    statusSent: 'Sent',
    statusOpened: 'Opened',
    statusClaimed: 'Says they paid',
    statusSettled: 'Settled',
    confirmPaid: 'Confirm received',
    confirmedToast: 'Marked as settled',
    cancelSplit: 'Cancel split',
    cancelConfirm: 'Cancel this split? The links stop working and the debts are removed.',
    tooMany: 'You can split with up to 20 people.',
    overBill: "The shares add up to more than the bill.",
    encrypted: 'Splitting is not available for end-to-end encrypted accounts, because the server cannot read the receipt.',
    offline: 'You need a connection to create the links.',
  },
```

`shareWith` interpolates a name; the rest are static. No key implies a guest is late or owes an apology — a guest who has not paid yet is just a guest who has not paid yet.

- [ ] **Step 2: Translate into the other 8**

Genuine translations, matching each file's existing formality register. `statusClaimed` is the one to get right: it means "this person has stated they paid", not "this person has paid" — the payer is the one who verifies. Do not translate it as a completed fact.

- [ ] **Step 3: Verify and commit**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`, then confirm every locale has the same key count.

```bash
git add apps/mobile/src/i18n/locales
git commit -m "feat(i18n): add receipt-split strings in all 9 locales"
```

---

### Task 3: API client and store

**Files:**
- Create: `apps/mobile/src/services/receiptSplit.api.ts`
- Create: `apps/mobile/src/stores/receiptSplitStore.ts`
- Modify: `apps/mobile/src/services/api.ts` (compose the new domain methods in)
- Test: `apps/mobile/src/stores/__tests__/receiptSplitStore.test.ts`

**Interfaces:**
- Consumes: `SplitStateResponse`, `SplitParticipantState`, `CreateSplitDto` from `@budget/shared-types`.
- Produces: `api.createSplit/getSplit/confirmSplitParticipant/cancelSplit`, and a `receiptSplitStore` exposing `{ split, isLoading, load, create, confirm, cancel }`.

**Server-only, not offline-first** — the same call as `purchaseRequestStore` and `tripStore`. Tokens come from the server and the state must be consistent across devices, so there is no local mirror and no sync queue.

Routes are `/expenses/:id/receipt-split` (note: **not** `/split` — that was renamed in Plan 1 to avoid confusion with the unrelated category-splits `/splits`).

- [ ] **Step 1: Write the failing store tests**

Cover: `load` populates from the API; a failed `load` leaves the previous state and logs with `console.warn` (never `console.error`, which RN's LogBox renders as a blocking red overlay); `confirm` optimistically marks the participant settled and rolls back on failure; `cancel` clears the split.

Follow the mocking shape in `src/components/receipt/__tests__/priceFindings.test.ts` — mobile Jest mocks `expo-sqlite` centrally now, but store tests still mock the API module.

- [ ] **Step 2: Run, implement, run**

`cd apps/mobile && npx jest receiptSplitStore`

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/receiptSplit.api.ts apps/mobile/src/services/api.ts apps/mobile/src/stores/receiptSplitStore.ts apps/mobile/src/stores/__tests__/receiptSplitStore.test.ts
git commit -m "feat(mobile): add the receipt-split API client and store"
```

---

### Task 4: The split screen

**Files:**
- Create: `apps/mobile/app/expense/split.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (**register the header** — a new Expo Router screen without one lands with no title and no back button)
- Create: `apps/mobile/src/components/split/ParticipantChips.tsx`
- Create: `apps/mobile/src/components/split/__tests__/validateSplit.test.ts`

**Interfaces:**
- Consumes: the store from Task 3, `receiptSplit.*` from Task 2.
- Produces: `validateSplit(participants, billTotal)` — a pure guard exported from the screen, in the shape of `validateTripSplit` in `TripExpenseSplitPicker.tsx`.

**Behavior.** Line items listed with a participant chip row; tapping an item then a chip assigns it. "+ Add person" appends a named chip. The payer's own share shows as the live remainder and is never editable — the server computes it, and the client must not re-derive shares or the two will disagree by a cent. When the expense has no line items, fall back to equal-split mode and say so with `equalHint`.

`validateSplit` blocks submit on: zero participants, more than 20, a blank name, or shares exceeding the bill. Unit-test it directly — that is the pattern this codebase uses for screen logic, since there is no react-test-renderer dependency.

- [ ] **Steps:** failing test for `validateSplit` → implement → build the screen → typecheck → commit.

---

### Task 5: The status view and sharing

**Files:** `apps/mobile/app/expense/split.tsx` (the same screen after a split exists)

Once a split exists the screen becomes its status view: one row per participant showing `sent → opened → says they paid → settled`, a per-row **Send** using `Share.share` with the participant's URL, a **Copy all links** action, and a **Confirm received** button on any row whose status is `claimed`.

Confirming calls the store's `confirm`, which hits `PATCH /expenses/:id/receipt-split/:participantId/confirm` — the same path a manual repayment takes server-side, so the debt closes exactly as it would by hand.

**Cancel** lives here too, behind `cancelConfirm`. Do not build it before Task 7 lands: until then, cancelling makes the receipt permanently un-splittable.

- [ ] **Steps:** extend the screen with the status rows → wire Send / Copy all / Confirm received → add the cancel affordance ONLY if Task 7 is already done → typecheck → commit.

Run: `cd apps/mobile && npx jest && npx tsc --noEmit -p tsconfig.json`

```bash
git add apps/mobile/app/expense/split.tsx apps/mobile/src/components/split
git commit -m "feat(mobile): show split status and let the payer send and confirm"
```

---

### Task 6: The entry point

**Files:** `apps/mobile/app/expense/[id].tsx` (the action row around `:320-345`)

Add a **Split** action beside the existing move-to-account button, following its shape exactly — `canEdit`-gated, and hidden when there is nothing to offer.

Hide it when: the account is end-to-end encrypted (the server rejects those, so offering it would produce a confusing failure — show `receiptSplit.encrypted` if you prefer surfacing why), the expense is itself a split receivable, or the trip is archived.

- [ ] **Steps:** add the action → confirm each hide condition by reading how the move button derives its own → typecheck → commit.

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`

```bash
git add apps/mobile/app/expense/[id].tsx
git commit -m "feat(mobile): add the split action to the expense screen"
```

---

### Task 7: Close the deferred client-id collision

**Files:** `apps/api/prisma/schema.prisma`, a new migration, `apps/api/src/modules/receipt-split/receipt-split.service.ts`, its spec.

**This must land before Task 5's cancel button ships.** Today, cancelling a split makes the receipt permanently un-splittable: the debt expense's client id is deterministic as `split-<expenseId>-<index>`, cancel only *soft-deletes* those expenses so the ids survive, and a re-split violates `Expense`'s unique `(accountId, clientId)`. The `P2002` handler then returns the cancelled rows as a **200 success** with dead links.

The determinism is load-bearing — it is the only guard against a concurrent double-create, since the participant table's unique column is a random token that would never collide.

**Use the partial unique index, not a generation counter.** The invariant actually wanted is "at most one live split per expense", and it belongs on the table that owns the concept:

```sql
CREATE UNIQUE INDEX receipt_split_live_slot
  ON receipt_split_participants (expense_id, seq)
  WHERE cancelled_at IS NULL;
```

with `seq` the participant index already computed in the create loop. Two concurrent creates both try to insert live `(expense_id, 0)` — one wins, the other gets `P2002` outside the transaction exactly as today. A re-split after a cancel finds the old rows carrying `cancelled_at NOT NULL`, so they drop out of the index automatically. No counter to derive, nothing to keep in sync, and the debt expense's client id becomes free to be a plain uuid.

Prisma cannot express a partial unique index in the schema, so hand-write it in the migration — `budget_alert_overall_unique … WHERE category_id IS NULL` is the in-repo precedent. Add `seq Int` to the model.

Test: a `createSplit` where `tx.expense.create` rejects with `P2002` **and** cancelled rows exist, asserting the caller does not receive them; and cancel → re-split succeeding with fresh ids.

- [ ] **Steps:** add `seq Int` to the model → author the migration DB-free (`git show HEAD:apps/api/prisma/schema.prisma > /tmp/before.prisma`, then `npx prisma migrate diff --from-schema-datamodel /tmp/before.prisma --to-schema-datamodel ./prisma/schema.prisma --script`; **do not** use `--from-migrations`, it needs a shadow database this repo does not have) → hand-add the partial index to the generated SQL, since Prisma cannot express it → simplify the debt client id to a uuid → tests → commit.

Read the generated SQL before committing and confirm it is additive.

Run: `cd apps/api && npx prisma validate && npx jest receipt-split` then `npm run typecheck` at the root.

```bash
git add apps/api/prisma apps/api/src/modules/receipt-split
git commit -m "fix(receipt-split): enforce one live split per expense with a partial unique index"
```

---

### Task 8: Rollout and documentation

**Files:** `docs/ops/receipt-split-rollout.md` (create), `.env.example`, `CLAUDE.md`, plus an ABA issue.

The runbook must carry the one thing that does not deploy with the code: the guest URL needs a `location /s/ { proxy_pass … }` block in `shared-nginx` on the VPS, which lives on the server and not in this repo. Until it exists, links resolve only as `api.ai-budget.pl/s/<token>` — which works, but puts an `api.` host in a message about money. State the exact block, note that `docker restart` does not reload `env_file` (an established trap here), and give the rollback.

`CLAUDE.md` gains a receipt-split section: the module (making it 44), the two-call-site guest surface, `isSplitReceivable` and why it is never `isDebt`, `APP_PUBLIC_URL`, and the `split_payment_claimed` notification. Then create the ABA issue per the project convention.

- [ ] **Steps:** write the runbook → add `APP_PUBLIC_URL` to `.env.example` → add the CLAUDE.md section → commit → create the ABA issue (main conversation only, never a subagent).

```bash
git add docs/ops/receipt-split-rollout.md .env.example CLAUDE.md
git commit -m "docs(receipt-split): add the rollout runbook and the CLAUDE.md section"
```

---

## Done when

- `cd apps/mobile && npx jest` and `npx tsc --noEmit` are clean; `cd apps/api && npx jest` and the root typecheck stay green.
- A 200 bill split three ways shows 200 of spending on the client, exactly as on the server, while a standalone cash loan still counts.
- Cancelling a split and splitting again works.
- All 9 locales carry the namespace and none implies a guest is late.
- The runbook exists and names the manual nginx step.

## Known pre-existing, not this plan's

A mobile Jest "worker failed to exit gracefully" warning. Separately, and **not** part of this feature: `PATCH /users/me` spreads its raw body into `prisma.user.update` with no validated DTO class, so any `User` column is settable including `email` — and `AdminGuard` authorizes on email against `ADMIN_EMAILS`. That is a live privilege-escalation path in shipped code and is being raised separately; do not fix it here.
