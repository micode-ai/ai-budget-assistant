-- Fix duplicate push notifications: add period_start to budget_alerts for atomic deduplication

-- Step 1: Remove duplicate alerts keeping only the earliest per (budget_id, threshold_percentage, date)
DELETE FROM "budget_alerts" a
USING "budget_alerts" b
WHERE a.id > b.id
  AND a.budget_id = b.budget_id
  AND a.threshold_percentage = b.threshold_percentage
  AND DATE(a.triggered_at) = DATE(b.triggered_at);

-- Step 2: Add column with a temporary default so existing rows can be backfilled
ALTER TABLE "budget_alerts" ADD COLUMN "period_start" DATE;

-- Step 3: Backfill existing rows
UPDATE "budget_alerts" SET "period_start" = DATE("triggered_at");

-- Step 4: Make NOT NULL
ALTER TABLE "budget_alerts" ALTER COLUMN "period_start" SET NOT NULL;

-- Step 5: Add unique constraint
CREATE UNIQUE INDEX "budget_alerts_budget_id_threshold_percentage_period_start_key"
  ON "budget_alerts"("budget_id", "threshold_percentage", "period_start");
