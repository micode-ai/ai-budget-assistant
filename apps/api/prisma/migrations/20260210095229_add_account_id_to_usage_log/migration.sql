-- AlterTable
ALTER TABLE "usage_logs" ADD COLUMN     "account_id" TEXT;

-- CreateIndex
CREATE INDEX "usage_logs_account_id_user_id_created_at_idx" ON "usage_logs"("account_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
