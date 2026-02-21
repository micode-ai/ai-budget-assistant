-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_response_mode" TEXT NOT NULL DEFAULT 'balanced';

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(12,2) NOT NULL,
    "current_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency_code" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ai_plan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fat_finder_reports" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "findings" JSONB NOT NULL,
    "total_savings" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fat_finder_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savings_goals_account_id_status_idx" ON "savings_goals"("account_id", "status");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");

-- CreateIndex
CREATE INDEX "fat_finder_reports_account_id_created_at_idx" ON "fat_finder_reports"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fat_finder_reports_account_id_period_start_period_end_key" ON "fat_finder_reports"("account_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fat_finder_reports" ADD CONSTRAINT "fat_finder_reports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
