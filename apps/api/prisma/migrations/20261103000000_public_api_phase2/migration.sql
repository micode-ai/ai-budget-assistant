-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "created_by_oauth_client_id" TEXT;

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "created_by_oauth_client_id" TEXT;

-- CreateIndex
CREATE INDEX "incomes_account_id_updated_at_id_idx" ON "incomes"("account_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "incomes_created_by_oauth_client_id_idx" ON "incomes"("created_by_oauth_client_id");

-- CreateIndex
CREATE INDEX "budgets_created_by_oauth_client_id_idx" ON "budgets"("created_by_oauth_client_id");

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_created_by_oauth_client_id_fkey" FOREIGN KEY ("created_by_oauth_client_id") REFERENCES "oauth_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_oauth_client_id_fkey" FOREIGN KEY ("created_by_oauth_client_id") REFERENCES "oauth_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
