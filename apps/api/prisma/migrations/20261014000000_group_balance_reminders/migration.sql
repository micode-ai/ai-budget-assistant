-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_group_reminders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "expense_group_members" ADD COLUMN     "balance_open_sign" INTEGER,
ADD COLUMN     "balance_open_since" TIMESTAMP(3),
ADD COLUMN     "last_reminder_at" TIMESTAMP(3),
ADD COLUMN     "reminder_count" INTEGER NOT NULL DEFAULT 0;

