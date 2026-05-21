-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "recurring_period" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_recurring_expenses" BOOLEAN NOT NULL DEFAULT true;
