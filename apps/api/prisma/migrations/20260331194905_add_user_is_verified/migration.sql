-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verification_code" TEXT,
ADD COLUMN     "email_verification_expires_at" TIMESTAMP(3),
ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false;
