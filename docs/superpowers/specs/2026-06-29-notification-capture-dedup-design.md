# Notification auto-capture cross-source dedup — Design

## Goal
A `source:'notification'` expense is a low-confidence machine stub produced from a bank push (ABA-294/295). The user often records the same transaction through a richer path (manual, OCR, voice, a bot, mobile sync). Today nothing reconciles the two: the stub and the real expense both persist, double-counting the spend. This feature makes the stub yield: it must never duplicate a transaction recorded another way, and any richer source supersedes it — while **never** auto-deduping two genuine non-notification expenses against each other (two identical 15 zł coffees the same day must both survive). The import path is already covered by `flagContentDuplicates` and is explicitly out of scope.

## The dedup rules (precise)

### Matching predicate `P(a, b)` (the single source of truth)
Two expenses `a`, `b` (same `accountId`, both `isDeleted:false`, `a.id !== b.id`) match iff **all** hold:
- `Number(a.amount) === Number(b.amount)` (exact decimal equality)
- `a.currencyCode === b.currencyCode` (no FX conversion — a EUR stub never matches a PLN expense)
- `|a.date - b.date| <= 1 day` (`DAY_MS = 86_400_000`; `Expense.date` is `@db.Date` so this is a calendar ±1-day window)
- **payee match**: `payeeOf(a) === payeeOf(b)` where `payeeOf(e) = (e.merchant?.trim() || e.description?.trim() || '').toLowerCase()`, and the label is **non-empty** (an expense with no merchant and no description can never match — nothing identifies it).

This is exactly the predicate `AnomalyService.detectDuplicateCharge` already uses (`anomaly.service.ts:388-411`). We extract it verbatim so dedup and the alert always agree.

### Case A — richer source supersedes the stub (SERVER-SIDE, in `ExpensesService.create`)
**Trigger:** a **non-`notification`** expense is created (`dto.source !== 'notification'`) AND it is genuinely new (`isNew === true`).
**Action:** find an existing non-deleted `source:'notification'` expense `s` where `P(newExpense, s)` holds. If found, **soft-delete `s`** (`isDeleted = true`, `syncVersion: { increment: 1 }`). Keep the new richer expense untouched.
**Directionality rationale:** the new expense is the higher-confidence record; the stub is the duplicate. We delete the stub, not the new row, so OCR line-items / receipt image / correct category / project links on the richer expense are preserved.
**v1 simplification:** do NOT carry the stub's `receiptImage`/fields onto the new expense. The stub has no receipt image (it is a push parse) and its category is, at best, the same merchant-rule the new expense would already resolve. Field carry-over is noted as a possible future enhancement, not v1.

### Case B — stub must not duplicate an existing real expense (CLIENT-SIDE, in `captureService`)
**Trigger:** a `source:'notification'` expense is about to be created from a parsed push.
**Action:** before `expenseStore.addExpense`, in addition to the existing `notif:` `externalRef` local-dedup, run a **content match** against the local `expenseStore.expenses`: if any non-deleted expense `e` satisfies `P(stub, e)` (same amount + currency + date ±1 day + payee), **skip the create entirely**. The existing real expense wins; no stub row is ever written locally or pushed.
**Directionality rationale:** doing Case B on the client avoids client/server divergence. If the server instead "skipped the create and returned the existing row", the client would still hold its own optimistic local stub row → permanent divergence (the local row has no server id to reconcile to). Skipping on the client means no row exists to diverge.

### Why split (B client / A server) and how soft-delete propagates
- **Case B is the notification-creation side.** Only the client originates notification captures (it is an on-device Android listener). The client already holds the full local expense set in `expenseStore`, so the content check is a cheap in-memory scan with zero added round-trips and no divergence risk.
- **Case A is the richer-source side.** Richer expenses arrive at `ExpensesService.create` from every path (app, bots, OCR, voice, mobile sync). The stub to delete lives server-side; the server is the only place that sees all sources converge. The soft-delete (`isDeleted:true`, bumped `syncVersion`) **propagates back to mobile through the existing sync pull** — `loadExpenses`'s server-pull merge reads `isDeleted` and removes/marks the local row, identical to any other server-side delete. No new sync plumbing.

## Required ordering vs the anomaly check (critical)
In `ExpensesService.create`, the Case A soft-delete **must run before** `anomalyService.checkExpense` is fired.

`detectDuplicateCharge`'s candidate query filters `isDeleted: false` (`anomaly.service.ts:399`). If we soft-delete the stub **first**, the stub is no longer a candidate, so no redundant/confusing `duplicate_charge` alert fires for the pair we just auto-reconciled. Concretely:

1. `$transaction` commits the new expense (unchanged).
2. **NEW (Case A):** after the transaction, when `result.isNew && dto.source !== 'notification'`, run `reconcileNotificationStub(accountId, result.expense.id)` and **await** it (it does a tightly-scoped find + a single `update`).
3. THEN fire-and-forget `anomalyService.checkExpense(...)` (existing call at `expenses.service.ts:270-274`), now guaranteed to see the stub gone.

Case A can run **after** the main transaction (it does not need to be atomic with the create — worst case on a crash between the two is one un-reconciled stub, identical to today's behavior, and the anomaly alert would still surface it). Keeping it outside the hot transaction avoids lengthening the create lock. It must still complete (await) before the anomaly fire to enforce ordering.

## File-by-file plan

### 1. `apps/api/src/modules/anomaly/anomaly.service.ts` — extract shared predicate
Export a pure helper so both the alert and Case A use identical logic:
```ts
export function expensePayee(e: { merchant?: string | null; description?: string | null }): string {
  return (e.merchant?.trim() || e.description?.trim() || '').toLowerCase();
}
export const DUP_DAY_MS = 24 * 60 * 60 * 1000;
```
Refactor `detectDuplicateCharge`'s inline `payeeOf` and `DAY_MS` to use these (no behavior change). `DAY_MS` already exists at module scope (line 10) — export it as `DUP_DAY_MS` or reuse `DAY_MS` directly if `ExpensesService` imports it. Keep the candidate-query shape (amount + currency + date window in SQL, payee in JS) as the canonical scoping pattern.

### 2. `apps/api/src/modules/expenses/expenses.service.ts` — Case A
Add a private method, called from `create` between the transaction and the anomaly fire:
```ts
private async reconcileNotificationStub(accountId: string, newExpenseId: string): Promise<void> {
  const e = await this.prisma.expense.findFirst({
    where: { id: newExpenseId, accountId, isDeleted: false },
    select: { id: true, amount: true, currencyCode: true, date: true, merchant: true, description: true },
  });
  if (!e) return;
  const label = expensePayee(e);
  if (!label) return; // unidentifiable — never dedup
  // Scope tightly: notification stubs only, same currency/amount, date ±1 day.
  const stubs = await this.prisma.expense.findMany({
    where: {
      accountId,
      isDeleted: false,
      source: 'notification',
      id: { not: e.id },
      amount: e.amount,
      currencyCode: e.currencyCode,
      date: { gte: new Date(e.date.getTime() - DUP_DAY_MS), lte: new Date(e.date.getTime() + DUP_DAY_MS) },
    },
    select: { id: true, merchant: true, description: true },
  });
  const stub = stubs.find((s) => expensePayee(s) === label);
  if (!stub) return;
  await this.prisma.expense.update({
    where: { id: stub.id },
    data: { isDeleted: true, syncVersion: { increment: 1 } },
  });
  await this.invalidateChatCache(accountId);
}
```
Wire into `create` (replacing the current lines 269-274):
```ts
if (result.isNew && result.expense) {
  const run = async () => {
    if (result.expense.source !== 'notification') {
      await this.reconcileNotificationStub(accountId, result.expense.id).catch(() => {});
    }
    await this.anomalyService.checkExpense(accountId, userId, result.expense.id).catch(() => {});
  };
  run().catch(() => {});
}
```
This keeps the whole thing fire-and-forget off the response path **while preserving ordering** (stub deleted before anomaly check). `result.expense.source` is available — it is the flattened response object from `toExpenseResponse`. Import `expensePayee` + `DUP_DAY_MS` from the anomaly module (already a dependency — `AnomalyService` is injected at line 16).

**Pre-check / performance gate:** the `source: 'notification'` filter makes this query nearly free in practice — for the vast majority of accounts the notification feature is off, so the `findMany` matches zero rows and returns immediately on the `(accountId, …)` scan. The query filters by `accountId` + `source` + `amount` + `currencyCode` + a narrow date range. There is no composite index on `(accountId, source, date)` today; the existing `@@index([accountId, merchant])` does not help here. **Recommendation:** add `@@index([accountId, source])` to the `Expense` model to keep the stub lookup cheap on large accounts — this is an **index-only** schema change (see Migration note). Gate the whole method behind `dto.source !== 'notification'` (already done) so non-feature traffic that isn't a notification still runs it, but it is one indexed, bounded query — acceptable on the create path.

### 3. `apps/mobile/src/services/notificationCapture/captureService.ts` — Case B
Extend the existing dedup block (`captureService.ts:68-77`). After the `externalRef` check, add a content match mirroring `P`:
```ts
const DAY_MS = 86_400_000;
const stubPayee = (merchant ?? '').trim().toLowerCase(); // captures use merchant or description fallback
const contentDup = existingExpenses.some((e) => {
  if (e.isDeleted) return false;
  if (Number(e.amount) !== Number(amount)) return false;
  if (e.currencyCode !== currencyCode) return false;
  const ed = new Date(e.date).getTime();
  if (Math.abs(ed - occurredAt.getTime()) > DAY_MS) return false;
  const otherPayee = (e.merchant?.trim() || e.description?.trim() || '').toLowerCase();
  const thisPayee = stubPayee || `bank notification (auto-captured)`.toLowerCase(); // mirror description fallback
  return otherPayee === thisPayee;
});
if (contentDup) return; // a richer expense already exists — do not create the stub
```
Put the payee/predicate in a small pure helper (e.g. `notificationCapture/contentMatch.ts` exporting `contentMatchesExisting(parsed, expenses)`) so it is unit-testable without the event pipeline. Keep the existing `externalRef` fast-path check first (it is the cheaper exact match for re-fired identical notifications).

**Merchant-match caveat (state explicitly):** the push merchant ("Żabka") and the OCR/manual description ("ZABKA Z123 WARSZAWA") often differ, so the payee equality may miss and a stub is still created. This is acceptable — Case A on the server will reconcile it once the richer expense syncs, and the anomaly `duplicate_charge` alert remains the user-visible fallback if both slip through. We deliberately do NOT add fuzzy matching (false-positive risk).

### 4. Schema — index only, NO data migration
Add `@@index([accountId, source])` to `model Expense` in `apps/api/prisma/schema.prisma`, then `prisma migrate dev --name add_expense_source_index`. This is purely an index addition — **no column changes, no backfill, no data transformation**. `ExpenseSource` already includes `'notification'` (additive plain-string column, no migration per ABA-294). If the team prefers zero schema churn for v1, the index can be deferred — the `source` filter still bounds the query — but it is recommended for accounts with large expense histories.

### 5. Tests — `apps/api/...spec.ts` + mobile `__tests__`
See Test list below. No shared-types/shared-utils/DTO changes (the predicate is internal). No i18n changes (no new user-facing strings).

## Edge cases

- **Offline create then sync (Case B).** Stub created offline → its `addExpense` content-check runs against the local store at creation time. If a richer expense is added later offline, Case A reconciles server-side once both sync. If the richer expense was already local when the stub fired, Case B skips the stub up front. No double-count survives a full sync cycle.
- **Notification-before-manual.** Stub exists; user later logs the expense manually. Manual create hits `ExpensesService.create` with `source !== 'notification'` → Case A finds the stub via `P` and soft-deletes it → propagates to mobile on next pull. Correct: stub removed, manual kept.
- **Manual-before-notification.** Manual expense exists locally; push fires. Case B finds the manual expense via local content match → stub never created. Correct.
- **Two genuine identical non-notification entries (MUST survive).** Two 15 zł "coffee" expenses, both `source:'manual'`, same day. Creating the second one runs Case A, which queries `source: 'notification'` ONLY — the first (manual) expense is not a candidate, so nothing is deleted. Case B does not apply (neither is a notification). Both survive. This is the central data-loss guard.
- **FX / currency mismatch.** `P` requires exact `currencyCode` equality and does no conversion. A EUR push and a PLN manual entry of "the same" purchase never match — both kept (no false dedup across currencies). Matches the import dedup's per-currency rule.
- **Soft-delete propagation.** Case A's `isDeleted:true` + `syncVersion` increment flows through the standard server-pull merge in `loadExpenses` (same path as any delete). The mobile in-app toast for the stub may have already fired before reconciliation — benign (the toast deep-links to an expense that becomes deleted; tapping resolves to "not found" gracefully, same as deleting any expense).
- **Viewer role.** Case A only runs as a side-effect of a successful `create`, which is already `ViewerBlockGuard`-gated upstream — a viewer can't create the richer expense, so Case A never fires for them. Case B is on-device capture; auto-capture is the device owner's own action and not account-role-scoped. No new role surface.
- **Unidentifiable expense.** If both merchant and description are empty, `payeeOf` is empty and `P` short-circuits to no-match — no dedup. Prevents wiping a stub against an unrelated blank expense.
- **Re-fired identical push.** Existing `externalRef` (`notif:<hash>`) check still handles exact re-fires; the content check is the additional layer for cross-source matches.

## Risks and how the rules prevent them

- **DATA-LOSS FALSE POSITIVE (highest priority).** The only auto-delete is Case A, and it deletes **only `source:'notification'`** rows. Two non-notification expenses can never delete each other — the query is hard-scoped to notification stubs. The two-coffees case has an explicit regression test. The payee non-empty requirement blocks matching on blank-vs-blank.
- **Redundant duplicate_charge alert.** Prevented by ordering: stub soft-deleted before `checkExpense` fires; the anomaly candidate query excludes `isDeleted` rows.
- **Client/server divergence.** Prevented by placing Case B (the notification-origin side) on the client so no divergent local row is ever written; Case A's deletion uses the existing sync channel.
- **Create-path latency.** Case A is one indexed, bounded query + at most one update, run off the response (fire-and-forget, after the transaction). The `source:'notification'` filter makes it a no-op for the overwhelming majority of accounts.
- **Missed dedup (false negative).** Acceptable by design — anomaly `duplicate_charge` alert remains the user-visible fallback. Erring toward keeping both rows is the safe direction.

## Out of scope
- The import path (`import-bank` / `import-wise`) — already content-dedups via `flagContentDuplicates`.
- Fuzzy / token-based merchant matching (false-positive risk).
- Carrying the stub's fields (receipt image, category) onto the surviving richer expense — possible future enhancement.
- Income notification capture (no income notification capture exists; income has no merchant field).
- Any new user-facing setting, screen, or i18n string.
- Reconciling two existing rows retroactively (backfill) — only new creates trigger dedup.

## Build order (role agents)
1. `aba-backend-engineer` — extract `expensePayee` + `DUP_DAY_MS` in `anomaly.service.ts` (step 1).
2. `aba-db-engineer` — add `@@index([accountId, source])` + migration `add_expense_source_index` (step 4).
3. `aba-backend-engineer` — `reconcileNotificationStub` + create-path wiring + ordering (step 2); API unit tests.
4. `aba-mobile-engineer` — `contentMatch.ts` helper + captureService Case B (step 3); mobile unit tests.

## Test list

**API — `anomaly.service.spec.ts` (predicate):**
- `expensePayee` prefers merchant, falls back to description, lowercases/trims, returns `''` when both empty.

**API — `expenses.service.spec.ts` (Case A):**
- New `source:'manual'` expense matching a `source:'notification'` stub (same amount/currency/date/payee) → stub soft-deleted (`isDeleted:true`), new expense untouched.
- Stub deletion runs **before** `anomalyService.checkExpense` (assert call order via spies).
- **MUST-NOT-DEDUP:** two identical `source:'manual'` 15 zł coffees same day → second create deletes nothing (no `source:'notification'` candidate). Both remain.
- Currency mismatch (EUR new vs PLN stub) → no deletion.
- Date outside ±1 day → no deletion.
- Empty merchant+description on the new expense → no deletion.
- New expense with `source:'notification'` → Case A not invoked (guard).
- No matching stub → no deletion, anomaly check still fires.

**Mobile — `notificationCapture/__tests__/contentMatch.test.ts` (Case B):**
- Parsed stub matching an existing non-deleted manual expense (amount/currency/date±1d/payee) → `contentMatchesExisting` true → capture skipped.
- Existing expense `isDeleted:true` → ignored (no skip).
- Currency mismatch → no skip.
- Date 2 days off → no skip.
- Different merchant text (push "Żabka" vs "ZABKA Z123") → no match (documents the accepted miss; Case A is the backstop).
- Existing `externalRef` match still short-circuits first (fast-path preserved).

---

## Tier 2 — suggest-merge

Tier 1 (above) auto-deletes only `source:'notification'` stubs against an exact same-currency match `P`. Tier 2 is a **separate, never-auto** layer for the case `P` deliberately rejects: the **same transaction recorded in two different currencies** (a €10 purchase the bank settled as 43 zł; or a notification in EUR plus a bank-import row in PLN). Amounts differ because the currencies differ, so this can never be content-equal — it is surfaced as a **user-confirmed merge suggestion**, never an auto-delete. Zero data-loss risk: tier 2 only ever *proposes*.

### Predicate `Q(a, b)` — the cross-currency match
Two non-deleted expenses `a`, `b` (same `accountId`, `a.id !== b.id`) suggest-merge iff **all** hold:
- `|a.date - b.date| <= 1 day` (`DUP_DAY_MS`; same calendar ±1-day window as `P`, `Expense.date` is `@db.Date`).
- **payee equality, non-empty**: `expensePayee(a) === expensePayee(b)` (the **exact same** exported helper from tier 1 step 1 — `(merchant?.trim() || description?.trim() || '').toLowerCase()`; empty label never matches).
- `a.currencyCode !== b.currencyCode` — **currencies differ** (this is what distinguishes `Q` from `P`).

`Q` is intentionally **currency-differs + payee + date only** (v1). We do **NOT** require the amounts to be FX-plausible (`a.amount ≈ convert(b.amount)`). Rationale: an FX check adds a rate dependency on a notify/create hot path, rates drift between the original-currency authorization and the settlement, and the bound on false positives is already tiny — two *different-currency* purchases at the *same merchant* on the *same day* are rare (a tourist buying twice in two currencies at one shop). Because tier 2 never auto-acts, a rare FP costs the user one dismissible suggestion, not lost data. The FX-plausibility refinement is noted as a future tightening, not v1.

### `P` and `Q` are mutually exclusive (the core safety invariant)
`P` requires `a.currencyCode === b.currencyCode`; `Q` requires `a.currencyCode !== b.currencyCode`. A given pair satisfies **at most one**. So a pair is *either* an exact tier-1 auto-dedup (same currency → `alreadyImported` / Case A soft-delete) *or* a tier-2 suggestion (different currency → propose), never both. Tier 1's auto-delete path and tier 2's suggestion path can never fire on the same pair → no double-counting, no auto-merge of a tier-2 pair.

### 2a. Bank-import preview — the `possibleMerge` row state

In `import-bank.service.ts` `buildPreviewResponse` (`import-bank.service.ts:211`), after the existing `externalRef` exact-flag loop and `flagContentDuplicates` (which together set `alreadyImported`), add **one new pass** that flags `possibleMerge`.

**New `ImportRow` fields** (in `apps/api/src/modules/import-bank/dto/index.ts`, `ImportRowDto`):
```ts
@IsOptional() @IsBoolean()  possibleMerge?: boolean;        // a Q-match exists, not an exact dup
@IsOptional() @IsArray() @IsString({ each: true })
                            mergeCandidateIds?: string[];     // existing expense server ids to merge into
```
Default `possibleMerge: false`, `mergeCandidateIds: []` in the `withRefs` map alongside `alreadyImported: false`.

**New pass `flagPossibleMerges(accountId, rows)`**, called **after** `flagContentDuplicates`:
```ts
private async flagPossibleMerges(accountId: string, rows: ImportRow[]): Promise<void> {
  // Only rows that are NOT already an exact dup, and not FX, are eligible.
  const eligible = rows.filter((r) => !r.alreadyImported && r.kind === 'expense');
  if (eligible.length === 0) return;
  const isoDates = [...new Set(eligible.map((r) => r.date))].filter(Boolean);
  if (isoDates.length === 0) return;
  const window = { gte: minus1Day(isoDates), lte: plus1Day(isoDates) };
  const existing = await this.prisma.expense.findMany({
    where: { accountId, isDeleted: false, date: window },
    select: { id: true, date: true, merchant: true, description: true, currencyCode: true },
  });
  for (const r of eligible) {
    const label = expensePayee(r);                 // shared tier-1 helper, merchant||description
    if (!label) continue;
    const matches = existing.filter(
      (e) =>
        expensePayee(e) === label &&
        e.currencyCode !== r.currencyCode &&        // Q: currencies DIFFER
        Math.abs(new Date(e.date).getTime() - new Date(r.date).getTime()) <= DUP_DAY_MS,
    );
    if (matches.length > 0) {
      r.possibleMerge = true;
      r.mergeCandidateIds = matches.map((m) => m.id);
    }
  }
}
```

**Riding alongside `alreadyImported` without double-counting:**
- The pass runs **only on `!r.alreadyImported` rows** — a row already flagged as an exact dup (same-currency `externalRef` or content match) is skipped, so the same row is never both `alreadyImported` and `possibleMerge`. Because `P` and `Q` are mutually exclusive, a row that content-matched a same-currency existing expense can't also `Q`-match that expense.
- `possibleMerge` does **not** touch the `importable`/`skipped` counts. A `possibleMerge` row stays **importable** (it is `!alreadyImported`), and the **default action is "import as new"** — the merge is *offered*, not forced. `importable = rows.filter(r => !r.alreadyImported).length` is unchanged; add an informational `possibleMerges = paired.filter(r => r.possibleMerge).length` to the response if a preview banner wants a count.
- `commit()` (`import-bank.service.ts:330`, `toImport = dto.rows.filter(r => !r.alreadyImported)`) is **unchanged**: a `possibleMerge` row the user left as "import as new" still imports normally. If the user chose **merge** in preview, the mobile client (a) drops that row from the committed `rows[]` (sets `alreadyImported: true` client-side before posting, so commit skips it) and (b) calls the new merge endpoint after commit to enrich the existing expense — OR simply imports-as-new and lets the post-import `possible_merge` alert (2b) catch it. v1 recommended flow: **preview merge = exclude the row from commit + call `/expenses/merge` with the chosen survivor**; keeping the import row out of commit avoids creating then deleting a row.

### 2b. Post-import reverse — the `possible_merge` alert

When a richer expense is created *after* a matching import row already exists (add a receipt / manual / notification that `Q`-matches an already-imported expense), surface a **merge suggestion** in the existing `anomaly_alerts` feed — parallel to `duplicate_charge`, fired from the same `AnomalyService.checkExpense` hook (`anomaly.service.ts:117`).

**New alert type** `'possible_merge'` added to `AnomalyAlertType` (`packages/shared-types/src/entities/anomaly-alert.ts:1`). This is the **only** type-union change; in the DB `anomaly_alerts.type` is a plain string column — **no migration**.

**New detector `detectPossibleMerge(accountId, userId, expense)`** in `anomaly.service.ts`, called from `checkExpense` after `detectDuplicateCharge`:
```ts
async detectPossibleMerge(accountId, userId, expense: DetectorExpense): Promise<void> {
  const label = expensePayee(expense);
  if (!label) return;
  const candidates = await this.prisma.expense.findMany({
    where: {
      accountId, isDeleted: false, id: { not: expense.id },
      currencyCode: { not: expense.currencyCode },          // Q: currencies DIFFER
      date: { gte: new Date(expense.date.getTime() - DAY_MS),
              lte: new Date(expense.date.getTime() + DAY_MS) },
    },
    select: { id: true, merchant: true, description: true, currencyCode: true, amount: true },
  });
  const other = candidates.find((c) => expensePayee(c) === label);
  if (!other) return;
  const params = {
    expenseId: expense.id,
    otherExpenseId: other.id,
    merchant: expense.merchant?.trim() || expense.description?.trim() || '',
    currencyA: expense.currencyCode,
    currencyB: other.currencyCode,
    amountA: Number(expense.amount).toFixed(2),
    amountB: Number(other.amount).toFixed(2),
  };
  await this.createAlert({
    accountId, userId, type: 'possible_merge',
    dedupKey: `merge:${[expense.id, other.id].sort().join(':')}`,   // ORDER-INDEPENDENT
    params, expenseId: expense.id,
    pushTitle: (lang) => ni18n.possibleMergeTitle(lang, params),
    pushBody:  (lang) => ni18n.possibleMergeBody(lang, params),
  });
}
```

- **dedupKey** `merge:{sortedId1}:{sortedId2}` — the two expense ids **sorted** so the same pair produces the same key regardless of which side fired the detector (whichever of the two was created second triggers it). The existing `@@unique([accountId, dedupKey])` on `anomaly_alerts` (insert + catch P2002) makes the suggestion fire **once per pair, ever**. (Contrast `duplicate_charge`'s `dup:{expenseId}`, which is keyed to the newer expense only — that is fine there because the auto-context differs; here we want strict once-per-pair.)
- **params**: both expense ids + both currencies + both amounts + the merchant label — enough for the card to render "€10.00 / 43.00 zł at Żabka — same purchase?" without a follow-up fetch.
- **Push gating**: reuse the existing `notifyAnomalyAlerts` preference + the 3/day cap (unchanged). Push `data` uses the `anomalyType` key (not `type`) per the existing ABA-242 note. Order `detectPossibleMerge` **last** in `checkExpense` (after duplicate/price/recurring/spike) so the scarcer high-value duplicate/price pushes win the daily cap.
- **Interplay with tier-1 Case A**: if the *new* expense is non-notification and a same-currency `notification` stub exists, tier-1 Case A soft-deletes the stub **before** `checkExpense` fires (the required-ordering rule above). `detectPossibleMerge` then sees only currency-*different* rows — exactly `Q`. The stub (same currency) is already gone, so it can't also raise a spurious `possible_merge`. The two layers compose cleanly.

**Mobile alert render** (`apps/mobile/app/alerts/index.tsx`):
- Add `possible_merge: 'git-merge-outline'` to `TYPE_ICON` (`alerts/index.tsx:19`).
- Add a `case 'possible_merge'` to `renderBody` (`alerts/index.tsx:42`): title `alerts.mergeTitle`, body `alerts.mergeBody` with `{merchant, amountA, currencyA, amountB, currencyB}`.
- Add to `handlePress` (`alerts/index.tsx:85`): `if (alert.type === 'possible_merge' && canEdit) router.push({ pathname: '/expense/merge', params: { aId: p.expenseId, bId: p.otherExpenseId } })`. Viewer (`!canEdit`): no navigation to the merge screen (read-only), matching the existing pattern.
- Push deep-link: extend `handleNotificationResponse` (`apps/mobile/src/services/notifications.ts:90`, `case 'spending_anomaly'`) — when `data.anomalyType === 'possible_merge'`, route to `/alerts` (same as today's anomaly deep-link; the user taps through from the feed). v1 keeps the push landing on `/alerts`; deep-linking straight to `/expense/merge` from a cold-start push is deferred (the cold-start gate complexity per ABA-264 isn't worth it for a suggestion).

### 3. The merge action — `POST /expenses/merge`

**Endpoint** (`apps/api/src/modules/expenses/expenses.controller.ts`): `@Post('merge')` — **declare it among the other static `@Post`/`@Patch` routes, and crucially BEFORE `@Patch(':id')`** is irrelevant for POST (different verb) but place it next to `@Post()` for clarity; it does not collide with `:id` routes (it's `POST /expenses/merge`, distinct from `POST /expenses`). Guards: class-level `JwtAuthGuard + AccountContextGuard` + method-level `@UseGuards(new ViewerBlockGuard())` (zero-dep guard, same as bulk/stop-recurring).

**DTO** `MergeExpensesDto` (`expenses/dto/index.ts`):
```ts
class MergeExpensesDto {
  @IsString() keepId: string;                 // survivor
  @IsString() mergeId: string;                // soft-deleted
  @IsOptional() @IsObject() fieldChoices?: {  // optional per-field override; default = "fill gaps from merged"
    merchant?: boolean; notes?: boolean; categoryId?: boolean;
    projectId?: boolean; tagIds?: boolean; receiptImage?: boolean;
  };
}
```

**Service `mergeExpenses(accountId, userId, dto)`** — one `$transaction`:
1. **Resolve both ids** by `OR: [{ id }, { clientId }]` scoped to `accountId, isDeleted:false` (mirrors `bulkUpdate` `expenses.service.ts:543-551` and `findOne` `expenses.service.ts:389`). The mobile sends local clientIds for device-created rows; matching on `id` only would silently no-op. If either resolves to nothing → throw `NotFoundException`. Reject `keepId === mergeId`.
2. **Carry-over (fill survivor's gaps from the merged row, or honor `fieldChoices`)**: for each of `merchant`, `notes`, `categoryId`, `projectId`, `receiptImage` — if the survivor's field is empty/null (or `fieldChoices[field] === true`) and the merged row has it, copy it onto the survivor. `receiptImage` is a `Bytes` column; copy only if the survivor has none. `projectId` lives in the `project_expenses` join, not a column (per the project-association note) — so "carry over project" means `tx.projectExpense` upsert for the survivor + soft-delete the merged row's join row, NOT a column write.
3. **Tags**: union — `tx.expenseTag.upsert({ expenseId: keepResolvedId, tagId })` for every tag on the merged row (same upsert loop as `bulkUpdate` `expenses.service.ts:584-592`).
4. **Soft-delete the secondary**: `tx.expense.update({ where: { id: mergeResolvedId }, data: { isDeleted: true, syncVersion: { increment: 1 } } })`.
5. **Bump survivor** so the enrichment propagates: `tx.expense.update({ where: { id: keepResolvedId }, data: { syncVersion: { increment: 1 }, updatedAt: now, ...carriedFields } })`.
6. After the transaction: `await this.invalidateChatCache(accountId)`. Return `{ keptId: keepResolvedId, mergedId: mergeResolvedId }`.

**Currency: which survives.** The currencies differ, so the survivor's `currencyCode` is whatever the user picked as `keepId`. **Recommendation (state in UI default):** default the survivor to the **bank-import / settlement-currency row** (the `source:'import'` row, or the one in the account's home currency) — that is the amount that actually debited the account, so the ledger total stays accurate. The user can override by choosing the other side as `keepId`. We do **NOT** FX-convert or sum the two amounts — exactly one row survives with its own amount/currency; the other is soft-deleted. (Summing would double-count; converting would invent a rate.)

`syncVersion++` on **both** rows means the standard server-pull merge in `loadExpenses` (a) removes the soft-deleted merged row on every device and (b) refreshes the enriched survivor — no new sync plumbing, same channel as tier-1 Case A's soft-delete.

### 3b. Mobile merge UX + store action

**Screen** `apps/mobile/app/expense/merge.tsx` (register the header in `app/_layout.tsx`): a side-by-side card of the two expenses (amount+currency, merchant/description, date, category, source badge, has-receipt indicator). The user:
- picks the **surviving record** (radio/segmented — default to the import/settlement-currency side per above),
- toggles **which fields to keep** when both have a value (merchant, notes, category, project, tags, receipt) → builds `fieldChoices`,
- confirms → `expenseStore.mergeExpenses(keepId, mergeId, fieldChoices)`.

Entry points: (1) the import-preview `possibleMerge` action ("Merge with existing" on the row → opens this screen pre-filled with the import row's chosen candidate + the import row); (2) the `possible_merge` alert tap (`aId`/`bId` params). All write affordances `canEdit`-gated (viewer sees the suggestion but the merge button is hidden / disabled, matching `alerts/index.tsx`).

**Store action** `mergeExpenses(keepId, mergeId, fieldChoices?)` (mirror `bulkUpdateExpenses` `expenseStore.ts:362` + `mergeMerchants` `expenseStore.ts:690` — optimistic + offline-first):
1. **Optimistic in-memory**: apply carried fields onto the survivor (mark `syncStatus:'pending'`), **filter out** the merged row (`isDeleted`) — same `.map().filter(e => !e.isDeleted)` shape as `bulkUpdateExpenses`.
2. **SQLite**: `softDeleteExpenseInDb(mergeLocalId, now)`; `updateExpenseInDb(keepLocalId, carriedFields, now, 'pending')`; tag links via `insertExpenseTag` (try/catch already-linked, as in bulk); project join via `addExpenseToProject`/`removeExpenseFromProject` (projectRepository). Receipt-image carry-over is server-side only (the blob isn't in the mobile row); the survivor picks it up on the next pull.
3. **Server (fire-and-forget)**: `api.mergeExpenses({ keepId, mergeId, fieldChoices })` with `.catch(e => console.warn(...))` — a failed push while **offline** is expected (rows stay `pending`, re-sync later); use `console.warn`, never `console.error` (the LogBox-overlay rule, ABA-157). Then `syncPendingExpenses()` so the survivor re-encrypts E2EE fields (merchant/notes are in `ENCRYPTION_FIELDS.expense.tier1`), exactly like `mergeMerchants`.

**API client** `apps/mobile/src/services/expenses.api.ts`: add `mergeExpenses(body: { keepId; mergeId; fieldChoices? })` → `POST /expenses/merge`.

### i18n keys (all 9 locales: en/de/es/fr/pl/ru/ua/be/nl)
- `alerts.mergeTitle` — e.g. "Same purchase, two currencies?"
- `alerts.mergeBody` — "{{amountA}} {{currencyA}} and {{amountB}} {{currencyB}} at {{merchant}} look like one transaction. Merge them?"
- `expenses.merge.title`, `expenses.merge.subtitle`
- `expenses.merge.keepWhich` ("Keep which record?")
- `expenses.merge.keepFields` ("Fields to keep")
- `expenses.merge.fieldMerchant` / `fieldNotes` / `fieldCategory` / `fieldProject` / `fieldTags` / `fieldReceipt`
- `expenses.merge.confirm`, `expenses.merge.merged` (toast), `expenses.merge.cannotMergeSelf`
- `bankImport.possibleMerge` ("May already exist in another currency"), `bankImport.mergeWithExisting`, `bankImport.importAsNew`
- Push: `possibleMergeTitle` / `possibleMergeBody` in `apps/api/src/modules/notifications/notification-i18n.ts` (9 langs), mirroring `duplicateChargeTitle/Body`.

### Edge cases (tier 2)
- **Which currency survives** — user picks; default = import/settlement-currency (home-currency) row. Covered above. Never sum, never FX-convert; exactly one row remains.
- **Two genuinely different-currency purchases at the same merchant, same day (rare FP)** — tier 2 only *suggests*; the user dismisses the alert / chooses "import as new". No data lost. The dedup-key (`merge:{sorted ids}`) ensures the suggestion fires once and a dismiss sticks.
- **FX not used in `Q`** — by design (v1). No rate provider on the create/preview path; the false-positive bound is acceptable because nothing auto-acts. Future: optional `amount ≈ convert(otherAmount, ±15%)` tightening.
- **`P` vs `Q` never overlap** — same-currency → `P` (tier 1 auto); different-currency → `Q` (tier 2 suggest). Mutually exclusive on `currencyCode`. A pair is auto-deduped XOR suggested, never both, never auto-merged-across-currencies.
- **Tier 2 never auto-acts** — no soft-delete, no row mutation happens in `flagPossibleMerges` or `detectPossibleMerge`; they only set a preview flag / insert an alert. The only mutation is the explicit user-driven `POST /expenses/merge`. Zero data-loss risk.
- **Viewer role** — viewer can *read* `possible_merge` alerts and the import preview, but `POST /expenses/merge` is `ViewerBlockGuard`-gated server-side and the merge button/affordances are `canEdit`-hidden client-side. No new role surface.
- **Offline merge sync** — `mergeExpenses` is optimistic + `pending`; the soft-delete + survivor enrichment push when back online (`syncVersion++` on both rows propagates the deletion and the carried fields via the normal pull merge). If the push fails offline, both rows stay `pending` and retry; no divergence (the merged row is locally soft-deleted, the survivor locally enriched — the server reconciles to the same state on push).
- **Merge then the merged row re-imported** — the soft-deleted survivor of a merge keeps its `externalRef`; tier-1 `externalRef` dedup still flags a re-import. The merged-away row's `externalRef` is **not** cleared (unlike an import-batch rollback) — re-importing the same file re-flags it as `alreadyImported` against the surviving/its-own ref; acceptable (no resurrection of the merged row).
- **No migration** — `'possible_merge'` is a plain string in `anomaly_alerts.type`; `possibleMerge`/`mergeCandidateIds` are transient preview-response fields (not persisted); the merge endpoint reuses existing columns. Only union-type additions in `shared-types`. (Optional: the tier-1-recommended `@@index([accountId, source])` is unrelated; `detectPossibleMerge`/`flagPossibleMerges` query by `(accountId, date)` — the existing date filter + `@db.Date` keeps the window query bounded; an `@@index([accountId, date])` could be considered if profiling shows the preview query is hot, but is not required for v1.)

### Build order (tier 2, role agents)
1. `aba-backend-engineer` — add `'possible_merge'` to `AnomalyAlertType` (`shared-types/src/entities/anomaly-alert.ts`); add `possibleMerge?`/`mergeCandidateIds?` to `ImportRowDto` (`import-bank/dto/index.ts`); add `MergeExpensesDto` (`expenses/dto/index.ts`).
2. `aba-backend-engineer` — `detectPossibleMerge` + `checkExpense` wiring (`anomaly.service.ts`); `flagPossibleMerges` pass in `buildPreviewResponse` (`import-bank.service.ts`); `mergeExpenses` service + `POST /expenses/merge` controller route (`expenses.service.ts` / `.controller.ts`); `possibleMergeTitle/Body` in `notification-i18n.ts`. API unit tests.
3. `aba-mobile-engineer` — `api.mergeExpenses` (`expenses.api.ts`); `expenseStore.mergeExpenses` (`expenseStore.ts`); `app/expense/merge.tsx` + header registration (`app/_layout.tsx`); `possible_merge` render + nav in `app/alerts/index.tsx`; import-preview `possibleMerge` row action; push deep-link branch in `notifications.ts`. Mobile unit tests.
4. `aba-designer` — review the side-by-side merge screen + import-preview "Merge / Import as new" affordance.
5. All 9 i18n locale files (`apps/mobile/src/i18n/locales/*.ts`) — the `alerts.merge*`, `expenses.merge.*`, `bankImport.*` keys.
6. **`aba-security` pre-merge audit** — REQUIRED: tier 2 touches the AI tool-call-adjacent expense surface, a new mutating endpoint, and receipt-image (`Bytes`) carry-over. Confirm account-scoping on both resolved ids (no cross-account merge via a crafted `mergeId`), `ViewerBlockGuard` coverage, and that `receiptImage` carry-over can't copy a blob across accounts.

### Test list (tier 2)

**shared-types** — `AnomalyAlertType` includes `'possible_merge'` (type-level; covered by compile).

**API — `anomaly.service.spec.ts` (detectPossibleMerge):**
- Two expenses, same payee + date ±1d, **different currency** → `possible_merge` alert created with both ids + currencies in params.
- **Same currency** pair → NO `possible_merge` (that's tier-1 `P` territory; assert no alert).
- Date > 1 day apart → no alert.
- Empty payee on the new expense → no alert.
- dedupKey is **order-independent**: creating B-then-A and A-then-B yields the same `merge:{sorted}` key → second insert hits `@@unique` P2002 → only one alert ever (assert single row).
- Fires **after** `detectDuplicateCharge` (call-order spy) and respects the daily push cap.

**API — `import-bank.service.spec.ts` (flagPossibleMerges):**
- Import row Q-matching an existing different-currency expense → `possibleMerge:true`, `mergeCandidateIds` set, row stays **importable** (`!alreadyImported`).
- Row already `alreadyImported` (same-currency exact/content dup) → NOT also `possibleMerge` (skipped).
- Same-currency existing match → no `possibleMerge` (only content-dup path applies).
- `importable`/`skipped` counts unchanged by the new pass.
- FX rows excluded.

**API — `expenses.service.spec.ts` (mergeExpenses):**
- Merge keeps survivor, soft-deletes secondary (`isDeleted:true`), bumps `syncVersion` on **both**.
- Gap-fill: survivor missing merchant/notes/category → filled from merged row; survivor that already has them → unchanged (unless `fieldChoices` forces).
- Tags unioned onto survivor (upsert, no dup).
- Project join carried via `projectExpense` (not a column write).
- **clientId resolution**: `keepId`/`mergeId` passed as clientIds resolve via `OR:[{id},{clientId}]` (mirror bulk test).
- `keepId === mergeId` → rejected.
- Cross-account `mergeId` (belongs to another account) → `NotFoundException`, nothing mutated (security).
- ViewerBlockGuard blocks the route (controller spec).

**API — `expenses.controller.spec.ts`:** `POST /expenses/merge` routes to `mergeExpenses` and does not collide with `:id` routes.

**Mobile — `expenseStore` test (mergeExpenses):**
- Optimistic: survivor enriched + `pending`, merged row removed from in-memory list.
- Offline server failure → `console.warn` (not `error`), rows stay `pending`.
- clientId pass-through to `api.mergeExpenses`.

**Mobile — `app/alerts` render test:** `possible_merge` renders `alerts.mergeTitle/Body` with both currencies; tap routes to `/expense/merge` with `aId`/`bId`; viewer sees no merge nav.
