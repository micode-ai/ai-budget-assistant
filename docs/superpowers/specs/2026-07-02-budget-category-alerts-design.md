# Budget Category Threshold Alerts — Design Spec

**Date:** 2026-07-02  
**Feature area:** Budgets / Notifications  
**Scope:** Extend existing budget threshold alerts to fire per budget-category allocation

---

## Problem

Currently `budget-alert.service.ts` checks thresholds [50, 80, 100%] only against the **total** budget amount. When a budget has per-category allocations (`BudgetCategory` rows), no notification fires when an individual category approaches or exceeds its own limit.

---

## Solution Overview

Add a second pass inside `checkBudgetThresholds` (or a dedicated helper it calls) that iterates every `BudgetCategory` allocation, computes per-category spend for the current budget period, and fires push notifications at the same thresholds using the same `budget_alert` notification type.

---

## Data Model

### `BudgetAlert` — add nullable `categoryId`

```prisma
model BudgetAlert {
  id                  String   @id @default(uuid())
  budgetId            String   @map("budget_id")
  categoryId          String?  @map("category_id")   // NULL = overall budget alert
  thresholdPercentage Int      @map("threshold_percentage")
  periodStart         DateTime @map("period_start")
  notificationSent    Boolean  @default(false) @map("notification_sent")
  createdAt           DateTime @default(now()) @map("created_at")

  budget Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)

  // existing @@unique is REMOVED — replaced by two partial indexes in raw SQL migration
  @@index([budgetId])
  @@map("budget_alerts")
}
```

### Migration: `20260702000000_add_budget_category_alert`

```sql
-- Add nullable column
ALTER TABLE budget_alerts ADD COLUMN category_id TEXT;

-- Drop the old single unique constraint
DROP INDEX IF EXISTS "budget_alerts_budget_id_threshold_percentage_period_start_key";

-- Partial unique index for overall budget alerts (category_id IS NULL)
CREATE UNIQUE INDEX budget_alert_overall_unique
  ON budget_alerts(budget_id, threshold_percentage, period_start)
  WHERE category_id IS NULL;

-- Partial unique index for per-category alerts (category_id IS NOT NULL)
CREATE UNIQUE INDEX budget_alert_category_unique
  ON budget_alerts(budget_id, category_id, threshold_percentage, period_start)
  WHERE category_id IS NOT NULL;
```

`createMany({ skipDuplicates: true })` uses `ON CONFLICT DO NOTHING` which respects partial unique indexes in Postgres — no code changes needed for dedup.

---

## Service Logic

### File: `apps/api/src/modules/budgets/budget-alert.service.ts`

**New private method** (called at the end of `checkBudgetThresholds`, after the existing overall threshold check):

```
checkCategoryThresholds(budget, accountId, currencyCode, periodStart, periodEnd)
```

**Steps:**

1. Skip if `budget.categoryAllocations.length === 0` — budgets without allocations have nothing to check.

2. **Single query** for per-category spend:
   ```ts
   const grouped = await this.prisma.expense.groupBy({
     by: ['categoryId'],
     where: {
       accountId,
       categoryId: { in: allocationCategoryIds },
       date: { gte: periodStart, lte: periodEnd },
       isDeleted: false,
       currencyCode,
     },
     _sum: { amount: true },
   });
   const spentMap = new Map(grouped.map(r => [r.categoryId, Number(r._sum.amount ?? 0)]));
   ```

3. For each allocation in `budget.categoryAllocations`:
   - `percentUsed = (spentMap.get(categoryId) ?? 0) / Number(allocation.amount) * 100`
   - Loop over `THRESHOLDS = [50, 80, 100]`:
     - If `percentUsed < threshold` → skip
     - Dedup: `findFirst({ budgetId, categoryId, thresholdPercentage: threshold, periodStart })`
     - If alert already exists → skip
     - `createMany({ data: [{ budgetId, categoryId, thresholdPercentage: threshold, periodStart }], skipDuplicates: true })`
     - Mark `notificationSent: true` before send, rollback to `false` on failure
     - Send push: `notifications.sendToUser(userId, 'budget_alert', { budgetId, alertId, thresholdPercentage: threshold, categoryId, categoryName: allocation.category.name })`

4. The method is called after the existing overall-budget pass — no change to call sites of `checkBudgetsForAccount`.

---

## Notifications

### Type

Reuses existing `'budget_alert'` — no new `NotificationType` value, no new preference toggle. Gated by existing `notifyBudgetAlerts` user preference.

### Push payload extension

```ts
{
  budgetId: string,
  alertId: string,
  thresholdPercentage: number,
  categoryId: string,       // NEW — undefined for overall alerts
  categoryName: string,     // NEW — undefined for overall alerts
}
```

### i18n strings — `notification-i18n.ts` (all 9 locales: en, de, es, fr, pl, ru, ua, be, nl)

| Key | English value |
|---|---|
| `budgetCategoryThresholdTitle` | `"{{categoryName}}: {{threshold}}% used"` |
| `budgetCategoryThresholdBody` | `"Budget «{{budgetName}}» — {{categoryName}} reached {{threshold}}% of its limit"` |
| `budgetCategoryExceededTitle` | `"{{categoryName}} over limit"` |
| `budgetCategoryExceededBody` | `"Budget «{{budgetName}}» — {{categoryName}} exceeded its allocation"` |

Selection logic: `threshold < 100` → Threshold pair, `threshold === 100` → Exceeded pair.

---

## Mobile

No mobile code changes required in this scope:
- `budget_alert` push type already deep-links to the budget detail screen.
- `categoryId` is available in `data` payload for future highlighting of the specific category row on the budget screen — deferred to a later iteration.

---

## What is NOT in scope

- New notification type or new preference toggle
- Mobile UI highlighting of the specific category on tap
- Category alerts for budgets without any `BudgetCategory` allocations
- Backfill of historical alerts

---

## Testing

Extend `budget-alert.service.spec.ts`:

- Category at 0% → no alert
- Category at 55% → 50% alert fires, 80%/100% do not
- Category at 85% → 50% + 80% alerts fire (or only 80% if 50% already sent)
- Category at 105% → all three alerts fire (or only 100% if lower ones already sent)
- Second run at same period → dedup prevents duplicate alerts
- Budget with no `categoryAllocations` → category check is skipped entirely
- Overall budget alert still fires independently of category alerts
