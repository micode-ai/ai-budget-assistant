-- AlterTable
ALTER TABLE "support_threads" ADD COLUMN     "email_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "first_unread_reply_at" TIMESTAMP(3),
ADD COLUMN     "last_emailed_at" TIMESTAMP(3);

