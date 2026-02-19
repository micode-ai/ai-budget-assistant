-- AlterTable
ALTER TABLE "account_transfers" ADD COLUMN     "count_as_income" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linked_income_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "account_transfers_linked_income_id_key" ON "account_transfers"("linked_income_id");

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_linked_income_id_fkey" FOREIGN KEY ("linked_income_id") REFERENCES "incomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
