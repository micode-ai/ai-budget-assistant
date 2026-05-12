-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_change_pending" TEXT,
ADD COLUMN "email_change_code" TEXT,
ADD COLUMN "email_change_expires_at" TIMESTAMP(3);
