# Proactive Anomaly Alerts — Design

**Date:** 2026-06-10
**Status:** approved (chat review)
**Idea:** `docs/product-ideas/proactive-anomaly-alerts.md`

## Problem

Every insight in the app today (Fat Finder, AI insights, vs-average chips) requires the user to open the app and look. The one existing proactive detector — `BudgetAlertService.checkSpendingAnomalies` (category spend +30% vs 3-month average) — has three structural flaws:

1. It silently skips categories that have no active budget (`if (!budget) continue`).
2. It dedups through `BudgetAlert` rows abusing `thresholdPercentage: -1` as a marker.
3. It fires only from `expenses.controller.ts`, so expenses created by Telegram/WhatsApp/Slack bots never trigger it.

There is also no persistent record: a push swiped away is lost forever, and web users (ai-budget.pl has no push) get nothing.

## Decision summary

| Question | Decision |
|---|---|
| Detectors in v1 | All four: price_increase, duplicate_charge, recurring_suggestion, category_spike (improved) |
| Trigger model | **On-write** (approach B): fire-and-forget check on expense creation, not a daily cron |
| Delivery | Push **and** a persistent in-app alerts feed (new `anomaly_alerts` table) |
| Tier gating | None — free for everyone (detectors are rule-based, zero LLM cost) |
| Feed entry point | Bell icon with unread badge in the home-screen hero header → `/alerts` screen |
| Notification type | Reuse existing `spending_anomaly` |
| Preference | New `notifyAnomalyAlerts` (default true) gates `spending_anomaly` instead of `notifyBudgetAlerts` |

## 1. Data model

New Prisma model `AnomalyAlert` → table `anomaly_alerts` (one migration, together with the `users.notify_anomaly_alerts` column):

```prisma
model AnomalyAlert {
  id          String    @id @default(uuid())
  accountId   String    @map("account_id")
  userId      String    @map("user_id")        // push recipient = expense creator
  type        String                            // 'category_spike' | 'price_increase' | 'duplicate_charge' | 'recurring_suggestion'
  dedupKey    String    @map("dedup_key")
  params      Json                              // render data: merchant, amounts, currencyCode, percent, categoryName…
  expenseId   String?   @map("expense_id")      // deep-link target
  categoryId  String?   @map("category_id")
  pushSent    Boolean   @default(false) @map("push_sent")
  readAt      DateTime? @map("read_at")
  dismissedAt DateTime? @map("dismissed_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  account Account @relation(fields: [accountId], references: [id])

  @@unique([accountId, dedupKey])
  @@index([accountId, createdAt])
  @@map("anomaly_alerts")
}
```

- **Dedup keys** (single mechanism for "already alerted"):
  - `dup:{newExpenseId}` — duplicate_charge
  - `price:{merchantNorm | recurringId | subscriptionId}:{YYYY-MM}` — price_increase, once per matched series per month (merchant when present, else the recurringId / subscription id that matched)
  - `spike:{categoryId}:{YYYY-MM}` — category_spike, once per category per month
  - `recur:{merchantNorm}` — recurring_suggestion, once ever per merchant
  - `merchantNorm` = trim + lowercase.
- No rendered text in the DB — only `params`. Mobile renders feed rows from its own i18n; push text is localized server-side via `notification-i18n.ts` (existing 9-language pattern).
- Insertion uses `create` and treats a unique-constraint violation on `(accountId, dedupKey)` as "already alerted, skip silently".

## 2. Detection — new module `apps/api/src/modules/anomaly/`

Files: `anomaly.module.ts`, `anomaly.controller.ts`, `anomaly.service.ts`, `dto/index.ts`.

### Entry point

`AnomalyService.checkExpense(accountId: string, userId: string, expenseId: string): Promise<void>` — never throws (top-level try/catch + `logger.error`, same as `BudgetAlertService`).

Called fire-and-forget (`.catch(() => {})`) from:

1. **`ExpensesService.create`** — after the row is written. This covers app, voice, OCR, and all three bots (they call the service, not the controller). The existing controller-level calls to `checkSpendingAnomalies` are **removed**; `checkBudgetsForAccount` stays where it is.
2. **Import commits** (wise + bank): after the commit `$transaction` succeeds, call `checkExpenseBatch(accountId, userId, expenseIds)` which runs only `price_increase` and `recurring_suggestion` per imported expense. `duplicate_charge` is skipped for imports (the import preview already does content-dedup) and `category_spike` runs once per distinct category in the batch.
3. **Subscription auto-charge cron** (`handleDueRenewals`): NOT hooked — the charge amount comes from the subscription itself, so price/duplicate checks are meaningless there.

### Detectors

All queries are narrow — scoped to the new expense's merchant / series / category. All amount comparisons are same-currency only (no FX conversion in v1).

**duplicate_charge** — possible double billing.
- Match: another non-deleted expense in the same account with the same `merchant` (skip if merchant is null/empty), same `amount`, same `currencyCode`, `date` within ±1 calendar day (`Expense.date` is `@db.Date`), different `id`. Rows from the same import batch never match each other (`importBatchId` equal and non-null → skip); all other combinations (manual+manual, manual+import) are eligible.
- Params: `{ merchant, amount, currencyCode, otherExpenseId }`. `expenseId` = the new expense.
- Priority: highest — always pushed if the daily cap allows.

**price_increase** — a recurring charge got more expensive.
- The new expense matches an active `UserSubscription` in the account by normalized name vs expense `merchant` or `name`, **or** belongs to a `recurringId` series.
- Previous amount = subscription's `amount` (same currency) or the previous expense in the series (same currency).
- Trigger: `newAmount > prevAmount * 1.10` (strictly greater than +10%).
- Params: `{ merchant, oldAmount, newAmount, currencyCode, percent }`.

**recurring_suggestion** — "looks like a subscription, track it?"
- Only when the expense has a non-empty `merchant` and no active `UserSubscription` already matches that merchant by normalized name.
- Look back 100 days: expenses with same merchant + same amount + same currency. Need ≥3 charges (incl. the new one) whose consecutive gaps are all within 25–35 days (monthly) or all within 6–8 days (weekly).
- Params: `{ merchant, amount, currencyCode, cycle: 'monthly' | 'weekly' }` — enough to prefill `/subscriptions/new` (Fat Finder prefill pattern).

**category_spike** — moved here from `BudgetAlertService.checkSpendingAnomalies`.
- Same math as today: current-month category total vs average of up-to-3 previous months (≥2 months of history required), trigger at ≥+30%.
- **Changed:** no budget required (the `if (!budget) continue` constraint is dropped); dedup via `spike:{categoryId}:{YYYY-MM}` dedupKey instead of `BudgetAlert` rows with `thresholdPercentage: -1`.
- `checkSpendingAnomalies` and its `-1` writes are deleted from `BudgetAlertService`; existing `-1` rows stay in the DB (harmless legacy, nothing reads them after this change).
- Params: `{ categoryId, categoryName, percent }`.

### Anti-spam (push cap)

- The feed row is **always** created (subject to dedupKey).
- Push is sent only if `count(AnomalyAlert where accountId, pushSent=true, createdAt >= today UTC) < 3`. `duplicate_charge` is checked/sent first within a single `checkExpense` run.
- `pushSent` is set true only when `NotificationsService.sendToUser` resolves true.

## 3. API endpoints

`AnomalyController`, class-level `@UseGuards(JwtAuthGuard, AccountContextGuard)`:

| Method | Route | Behavior |
|---|---|---|
| GET | `/alerts?unread=true` | Last 50 alerts for the account, `dismissedAt: null`, newest first; `unread=true` filters `readAt: null`. Response includes `unreadCount`. |
| PATCH | `/alerts/:id/read` | Sets `readAt` (idempotent). Scoped to `accountId`. |
| PATCH | `/alerts/read-all` | Sets `readAt` on all unread for the account. |
| DELETE | `/alerts/:id` | Sets `dismissedAt` (soft hide from feed). |

Read/dismiss are account-level (not per-user) in v1 — acceptable for shared accounts; revisit if it bites. Write endpoints (`read-all`, `:id/read`, `DELETE :id`) carry `ViewerBlockGuard` — read/dismiss state is account-wide, so a viewer mutating it would affect all members. `GET /alerts` stays viewer-accessible.

Declare `read-all` **before** `:id` routes (Express declaration-order lesson from ABA-166).

## 4. Push & preferences

- Notification type: existing `spending_anomaly` for all four detector types (payload `data` carries `{ alertId, type, expenseId? }`).
- New `User.notifyAnomalyAlerts Boolean @default(true) @map("notify_anomaly_alerts")`. `notifications.service.ts` gates `spending_anomaly` by it (replacing the current `notifyBudgetAlerts` gate on that type).
- `GET/PATCH /users/me/notification-preferences` gains `anomalyAlerts: boolean`; shared-types `NotificationPreferencesResponse` updated; toggle added in `app/settings/notifications.tsx`.
- `notification-i18n.ts`: new title/body pairs for `price_increase`, `duplicate_charge`, `recurring_suggestion` in all 9 server languages (category_spike reuses the existing `anomalyTitle`/`anomalyBody`).
- Push tap → `handleNotificationResponse` deep-links to `/alerts` (same pattern as `chat_mention`).

## 5. Mobile

- **Bell icon** in the home hero header (`(tabs)/index.tsx`) with an unread-count badge (hidden at 0). Visible to all roles incl. viewer.
- **Screen `app/alerts/index.tsx`** — registered in `app/_layout.tsx` **with a nav header (title + back)**. Card list: per-type icon + title + description + relative time; unread visual accent. Tap behavior: `duplicate_charge`/`price_increase`/`category_spike` → `expense/[id]` (when `expenseId` present) and mark read; `recurring_suggestion` → `/subscriptions/new` prefilled via router params (existing Fat Finder pattern) and mark read. Row affordances: dismiss (X) per row; "mark all read" in the header.
- **`alertStore.ts`** (26th Zustand store): `alerts`, `unreadCount`, `isLoading`, `loadAlerts()`, `markRead(id)`, `markAllRead()`, `dismiss(id)`. In-memory only (no SQLite cache in v1); optimistic updates with `console.warn` on server failure. Loaded on home-tab mount and on screen focus.
- **`alerts.api.ts`** (15th domain API file) + barrel re-export in `api.ts`.
- **i18n**: new `alerts.*` section (screen title, empty state, per-type title/body templates, actions) in **all 9 locale files**.
- Web works automatically (feed is server-backed; push is absent on web by design).

## 6. Testing

- `anomaly.service.spec.ts` — mocked Prisma; per detector: positive case, negative case, dedupKey collision (silent skip), threshold boundaries (exactly +10% = no alert; gap 24/36 days = no suggestion; 1-month history = no spike), push cap (4th alert of the day → feed row yes, push no), import batch skips duplicate detector.
- `anomaly.controller.spec.ts` — route order (`read-all` vs `:id`), account scoping.
- Existing `expenses.controller.spec.ts` updated (anomaly check moved out of controller).

## Out of scope (v1)

- FX-normalized comparisons across currencies.
- Per-user read state on shared accounts.
- SQLite offline cache for the feed.
- Bot-channel delivery of alerts (separate idea: `bot-notification-channel`).
- Admin visibility/analytics for alerts.

## Effort

~1 week. One Prisma migration (`anomaly_alerts` table + `users.notify_anomaly_alerts`). No mobile SQLite migration.
