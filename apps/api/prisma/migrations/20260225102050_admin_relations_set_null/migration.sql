-- DropForeignKey
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_admin_id_fkey";

-- AlterTable
ALTER TABLE "admin_audit_logs" ALTER COLUMN "admin_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "notification_logs" ALTER COLUMN "admin_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "scheduled_notifications" ALTER COLUMN "admin_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
