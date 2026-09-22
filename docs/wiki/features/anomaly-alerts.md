# Anomaly alerts

*Hub: [analytics-insights](../analytics-insights.md) · related: [receipt-price-check](receipt-price-check.md)*

## What this is

Rule-based proactive alerts with **no LLM cost**, fired on expense write rather than by a cron.

## Entry points

- `apps/api/src/modules/anomaly/anomaly.service.ts` — the thin orchestrator plus the alert CRUD
- `anomaly-detectors.service.ts` — all the `detect*` methods
- `anomaly-alert-writer.service.ts` — `createAlert`, the one shared insert path
- `anomaly-helpers.util.ts` — pure: `expensePayee`, `normalizeMerchant`, `monthKey`, `detectCycle`,
  `DUP_DAY_MS`, the thresholds
- `apps/mobile/app/alerts/index.tsx`, `apps/mobile/app/expense/merge.tsx`

Migrations: `20260610000000_add_anomaly_alerts`, `add_expense_source_index`.

## Key concepts

**Fired on write, not on a schedule.** `checkExpense` is fired-and-forgotten from
`ExpensesService.create`, which covers the app, voice, OCR, all three bots and mobile sync.
`checkExpenseBatch` runs after both import commits — with the duplicate detector skipped, because
the import preview already content-dedups.

**The detectors** are duplicate charge, price increase, recurring suggestion, category spike,
possible merge and price overcharge. `detectPriceOvercharge` runs from `checkExpense` only, never
from the batch, because imports have no line items.

**`@@unique([accountId, dedupKey])` IS the dedup.** Insert and catch P2002 means "already alerted".
No alert text is stored — only `params` Json; mobile renders from i18n and pushes are localized
server-side.

**The service was split** out of a 689-line god class: helpers (pure), types, the alert writer, and
the detectors. `AnomalyService` stayed the public face, so no external caller changed.

## Invariants

**Payee is `merchant || description`.** A duplicated expense with no merchant is still caught,
because `expensePayee` falls back to the description. Candidates are queried by amount, currency and
date; the payee label is matched in JS.

**Tier 1 and tier 2 are mutually exclusive by construction.** Auto-dedup requires the same currency;
suggest-merge requires a different one. A pair is therefore auto-deduped XOR suggested, never both.

**Only notification stubs are deletion candidates.** `reconcileNotificationStub` soft-deletes a
matching `source: 'notification'` row when a non-notification expense is created — two genuine
non-notification expenses are never deleted. It runs BEFORE the fire-and-forget `checkExpense`, so
the suppressed stub is never a duplicate-charge candidate.

**The merge dedup key is order-independent** (`merge:{sortedId1}:{sortedId2}`), so a pair is
suggested once ever.

**Push `data` uses the key `anomalyType`.** A plain `type` would be overwritten by
`NotificationsService`.

**An alert's `expenseId` is the SERVER PK**, so the deep link resolves an expense by `id` OR
`serverId` OR `clientId` OR `localId` — on a device the local row id is the clientId and the server
PK lives in `serverId`, so matching only `id` showed "Expense not found".

**If the target does not resolve, force ONE pull and retry** before concluding anything. The naive
alternative — instant-dismiss gated on `expenses.length > 0` — would wrongly hide alerts whose
expense merely lacked `serverId`, and it is this pull-and-retry that rescues already-stuck alerts.

**Keep the create response's id.** `addExpense` and `syncPendingExpenses` used to discard
`api.createExpense`'s result, so a freshly created expense had no `serverId` until the next full
pull — which is exactly why the expense that had just triggered a duplicate-charge alert could not
be opened from it.

**Dismiss on delete.** `dismissForExpense` matches the top-level `expenseId` **or**
`params.otherExpenseId`, so deleting either side of a duplicate pair clears the alert.

**Tier 2 never auto-acts.** Only `POST /expenses/merge` mutates.

## Known gaps

- The daily push cap is a read-then-act race — known and benign.
- `detectCategorySpike` groups by `categoryId`, so a spike confined to a split-only category will not
  fire.
- `possible_merge` is a plain string in the `type` column, with no migration behind it.

## History

ABA-242 (the feature) · ABA-245 (payee fallback) · ABA-246 (badge refresh) · ABA-247 (four-way id
resolution) · ABA-296 (notification-capture dedup, tiers 1 and 2) · ABA-339 (the deep link, and
resolve-on-delete) · ABA-532 (the mark-as-recurring nudge).
