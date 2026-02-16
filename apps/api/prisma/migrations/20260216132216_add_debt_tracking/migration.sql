-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "debt_contact_name" TEXT,
ADD COLUMN     "debt_due_date" DATE,
ADD COLUMN     "is_debt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_debt_repayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "related_debt_income_id" TEXT;

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "debt_contact_name" TEXT,
ADD COLUMN     "debt_due_date" DATE,
ADD COLUMN     "is_debt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_debt_repayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "related_debt_expense_id" TEXT;

-- CreateIndex
CREATE INDEX "expenses_account_id_is_debt_idx" ON "expenses"("account_id", "is_debt");

-- CreateIndex
CREATE INDEX "incomes_account_id_is_debt_idx" ON "incomes"("account_id", "is_debt");
