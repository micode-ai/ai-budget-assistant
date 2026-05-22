-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "external_ref" TEXT;

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN "external_ref" TEXT;

-- AlterTable
ALTER TABLE "currency_exchanges" ADD COLUMN "external_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "expenses_account_id_external_ref_key" ON "expenses"("account_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_account_id_external_ref_key" ON "incomes"("account_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "currency_exchanges_account_id_external_ref_key" ON "currency_exchanges"("account_id", "external_ref");
