-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme_mode" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "users" ADD COLUMN "accent_color" TEXT;
