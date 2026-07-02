-- DropIndex
DROP INDEX "budget_alerts_budget_id_threshold_percentage_period_start_key";

-- AlterTable
ALTER TABLE "budget_alerts" ADD COLUMN     "category_id" TEXT;

-- CreateIndex
CREATE INDEX "budget_alerts_budget_id_idx" ON "budget_alerts"("budget_id");

-- Partial unique index: overall budget alerts (category_id IS NULL)
CREATE UNIQUE INDEX "budget_alert_overall_unique"
  ON "budget_alerts"("budget_id", "threshold_percentage", "period_start")
  WHERE "category_id" IS NULL;

-- Partial unique index: per-category alerts (category_id IS NOT NULL)
CREATE UNIQUE INDEX "budget_alert_category_unique"
  ON "budget_alerts"("budget_id", "category_id", "threshold_percentage", "period_start")
  WHERE "category_id" IS NOT NULL;
