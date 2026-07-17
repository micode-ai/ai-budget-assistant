# Shopping reminder / deal push de-duplication

**Date:** 2026-07-17
**Status:** Approved (design)
**Area:** `apps/api/src/modules/shopping-list`

## Problem

`ShoppingReminderCron` (`0 10 * * *`) sends a `shopping_reminder` push for the
single most-overdue restock candidate and a `shopping_deal` push for the top
price drop — **every single day**, with no memory of what was already sent.

`predictRestock` is level-triggered: `dueInDays = medianGapDays − daysSinceLast`.
A frequently-bought staple (e.g. bread, median gap ~2 days) becomes overdue
almost immediately after each purchase and *stays* overdue (dueInDays grows more
negative) until it is repurchased. Since the cron sends the most-overdue item
(`due[0]`), that staple is re-sent **daily**. User complaint: "каждый день
приходит, что нужно купить хлеб". Deals have the identical flaw — the same drop
is re-alerted daily while it remains inside the 14-day recent window.

Root cause: **no de-duplication / no record of what was already notified.**

## Goals

- Not intrusive, not repetitive: notify about a given restock **at most once per
  purchase cycle**.
- Same de-dup discipline for deals: at most once per deal per store per week.
- A soft global floor so a user tracking many staples is not pushed almost
  daily about *different* items.
- Survive deploys/restarts (the whole point is remembering across days).
- No new AI/LLM cost (feature is already deterministic).

## Non-goals

- No change to `predictRestock` / `detectDeals` maths.
- No change to notification preferences (`notifyShoppingReminders` /
  `notifyShoppingDeals` stay the per-type opt-out toggles).
- No mobile UI change (server-side behavior only).
- No change to the shopping-list ↔ suggestion suppression (items on an active
  list still suppress suggestions, unchanged).

## Design

### 1. Restock — edge-triggered (once per purchase cycle)

De-dup key is bound to the product's **last purchase date**:

```
restock:{canonicalName}:{lastPurchaseISO}     // lastPurchaseISO = YYYY-MM-DD
```

- First day a product is a candidate (`dueInDays <= 0`, not on a list) in this
  cycle → the key does not exist → **send** + record the key.
- Subsequent days: same last-purchase date → same key → **skip**.
- Product repurchased → `lastPurchase` changes → new key → eligible again, but
  not immediately due → fires **once** when it next crosses the due threshold.

Self-tuning to real buying behavior; no cooldown constant needed. `lastPurchase`
is already present on `RestockSuggestion`.

### 2. Deals — once per occurrence

De-dup key:

```
deal:{canonicalName}:{merchant}:{isoWeek}     // isoWeek = YYYY-Www
```

The same drop at the same store is not re-alerted more than once per ISO week.
A deal naturally expires out of the 14-day recent window, so weekly granularity
means "once per deal window" in practice.

### 3. Soft global floor (anti-nag guard)

Even with per-item de-dup, many tracked staples could each newly become due on
different days → a push almost daily about *different* items. Guard: send at
most **one `shopping_reminder` and one `shopping_deal` per account every
`SHOPPING_REMINDER_MIN_GAP_DAYS` days** (default **2**, env-tunable, on by
default). The existing "{top} and {N} more" digest body means a single push
still surfaces everything that came due.

The floor is enforced by checking the most recent `sentAt` for that account+type
in `shopping_notification_log` before sending; if it is within the gap window,
skip this run for that type.

### 4. Storage — `shopping_notification_log` table

Model mirrors `anomaly_alerts`' de-dup convention exactly (`@@unique([accountId,
dedupKey])`, insert-and-catch-P2002 = "already sent" → skip; **no `$transaction`**
— Postgres poisons a tx on the first unique violation, ABA-313).

```prisma
model ShoppingNotificationLog {
  id        String   @id @default(uuid())
  accountId String   @map("account_id")
  type      String                                  // 'shopping_reminder' | 'shopping_deal'
  dedupKey  String   @map("dedup_key")
  sentAt    DateTime @default(now()) @map("sent_at")

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, dedupKey])
  @@index([accountId, type, sentAt])              // powers the global-floor lookup
  @@map("shopping_notification_log")
}
```

`Account` gains the back-relation `shoppingNotificationLogs ShoppingNotificationLog[]`.

**Migration**: authored DB-free via `prisma migrate diff` (this repo runs
migrations against prod via the deploy migrator; there is no local DB), same as
the inflation-shield migration.

**No mobile SQLite change** — this is server-only send-state, never synced to
devices.

### 5. Send flow (rewritten cron)

Per account, per type:
1. Compute candidates (`getRestockSuggestions` / `getDeals` — unchanged).
2. If none → continue.
3. **Global floor**: if the newest `sentAt` for `(accountId, type)` is within
   `SHOPPING_REMINDER_MIN_GAP_DAYS` → skip this type this run.
4. Build the per-cycle/occurrence `dedupKey` for the top candidate.
5. Try `create({ accountId, type, dedupKey })`; on **P2002 → skip** (already
   sent this cycle/week). No transaction.
6. On successful insert → send the push to all eligible members (unchanged
   `NotificationsService.sendToUser` + per-type preference gate).

De-dup + push-send live in a small `ShoppingNotificationLedger` helper (pure,
Prisma-only) so the cron stays thin and the dedup logic is unit-testable in
isolation.

### 6. Cleanup

Daily `@Cron('0 3 * * *')` `cleanupOldLogs()` deletes `shopping_notification_log`
rows older than 90 days (mirrors the family-feed cleanup cron). Keeps the table
bounded; old keys are irrelevant once a product has cycled many times.

## Edge cases

- **Redis/deploy resilience**: state is in Postgres, so a deploy/restart does not
  re-trigger yesterday's "buy bread".
- **Multi-member accounts**: de-dup is per **account**, not per member (the
  suggestion set is account-scoped) — one insert gates the push to every member,
  matching today's fan-out.
- **P2002 race** (two cron instances / retries): caught outside any transaction,
  treated as "already sent" → skip. Safe.
- **Preference off**: `NotificationsService.sendToUser` still gates on
  `notifyShoppingReminders` / `notifyShoppingDeals` per user; the ledger insert
  happens before fan-out, so an all-opted-out account still records the key
  (harmless — prevents a pointless daily recompute-and-attempt).
- **Item added to a list mid-cycle**: suggestions already exclude on-list items,
  so it simply drops out of candidates — no special handling.

## Testing

- Unit tests for the ledger/dedup logic:
  - first call for a cycle sends; second call same cycle skips (P2002).
  - `lastPurchase` date change → new key → sends again.
  - deal key changes across ISO weeks.
  - global floor: second type-send within `MIN_GAP_DAYS` skipped; outside → sent.
- Update `shopping-reminder.cron.spec.ts` to the new send flow (assert dedup
  insert attempted, skip-on-P2002, floor honored).
- Cleanup cron test (deletes rows older than 90 days).

## Config

- `SHOPPING_REMINDER_MIN_GAP_DAYS` — global per-account per-type floor in days
  (default 2). Clamp `>= 0`; 0 disables the floor (dedup still applies).

## Rollout

Additive: new table + cron rewrite. No data backfill (an empty log simply means
"everything is eligible on the next run", which then immediately de-dups going
forward). Existing `shopping_reminder` / `shopping_deal` notification types and
preferences are unchanged.
