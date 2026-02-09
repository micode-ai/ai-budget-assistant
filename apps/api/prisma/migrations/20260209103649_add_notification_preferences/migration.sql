-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_budget_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_shared_activity" BOOLEAN NOT NULL DEFAULT true;
