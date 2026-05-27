-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "merchant" TEXT;

-- CreateIndex
CREATE INDEX "expenses_account_id_merchant_idx" ON "expenses"("account_id", "merchant");
