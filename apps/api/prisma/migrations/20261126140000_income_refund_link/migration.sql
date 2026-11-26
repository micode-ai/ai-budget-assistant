ALTER TABLE "incomes" ADD COLUMN "refund_of_expense_id" TEXT;
CREATE INDEX "incomes_refund_of_expense_id_idx" ON "incomes"("refund_of_expense_id");
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_refund_of_expense_id_fkey" FOREIGN KEY ("refund_of_expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
