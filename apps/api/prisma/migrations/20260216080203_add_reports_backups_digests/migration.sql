-- AlterTable
ALTER TABLE "users" ADD COLUMN     "monthly_digest_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weekly_email_day" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weekly_email_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_name" TEXT NOT NULL,
    "file_data" BYTEA,
    "file_size" INTEGER,
    "filters" JSONB NOT NULL,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "entity_counts" JSONB NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryption_key_version" INTEGER,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_digest_cache" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_digest_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_reports_user_id_created_at_idx" ON "generated_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "generated_reports_account_id_user_id_idx" ON "generated_reports"("account_id", "user_id");

-- CreateIndex
CREATE INDEX "backup_history_user_id_created_at_idx" ON "backup_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "monthly_digest_cache_account_id_idx" ON "monthly_digest_cache"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_digest_cache_account_id_period_start_period_end_key" ON "monthly_digest_cache"("account_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_digest_cache" ADD CONSTRAINT "monthly_digest_cache_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
