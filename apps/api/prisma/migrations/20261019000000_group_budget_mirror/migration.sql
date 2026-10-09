-- CreateEnum
CREATE TYPE "GroupCashLinkKind" AS ENUM ('payer_expense', 'settlement_out', 'settlement_in');

-- CreateEnum
CREATE TYPE "GroupCashLinkOrigin" AS ENUM ('auto', 'user');

-- CreateEnum
CREATE TYPE "GroupCashSuggestionStatus" AS ENUM ('open', 'rejected');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "group_expense_id" TEXT,
ADD COLUMN     "group_member_id" TEXT,
ADD COLUMN     "group_share_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "expense_group_members" ADD COLUMN     "budget_account_id" TEXT,
ADD COLUMN     "budget_category_id" TEXT,
ADD COLUMN     "budget_mirror_from" DATE;

-- CreateTable
CREATE TABLE "group_cash_links" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "kind" "GroupCashLinkKind" NOT NULL,
    "leg_key" TEXT NOT NULL,
    "group_expense_id" TEXT,
    "settlement_id" TEXT,
    "expense_id" TEXT,
    "income_id" TEXT,
    "origin" "GroupCashLinkOrigin" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_cash_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_cash_suggestions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "kind" "GroupCashLinkKind" NOT NULL,
    "leg_key" TEXT NOT NULL,
    "group_expense_id" TEXT,
    "settlement_id" TEXT,
    "candidate_key" TEXT NOT NULL,
    "expense_id" TEXT,
    "income_id" TEXT,
    "status" "GroupCashSuggestionStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_cash_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_cash_links_expense_id_key" ON "group_cash_links"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_cash_links_income_id_key" ON "group_cash_links"("income_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_cash_links_member_id_leg_key_key" ON "group_cash_links"("member_id", "leg_key");

-- CreateIndex
CREATE INDEX "group_cash_suggestions_expense_id_idx" ON "group_cash_suggestions"("expense_id");

-- CreateIndex
CREATE INDEX "group_cash_suggestions_income_id_idx" ON "group_cash_suggestions"("income_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_cash_suggestions_member_id_leg_key_candidate_key_key" ON "group_cash_suggestions"("member_id", "leg_key", "candidate_key");

-- CreateIndex
CREATE INDEX "expenses_group_member_id_idx" ON "expenses"("group_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_group_expense_id_group_member_id_account_id_key" ON "expenses"("group_expense_id", "group_member_id", "account_id");

-- CreateIndex
CREATE INDEX "expense_group_members_budget_account_id_idx" ON "expense_group_members"("budget_account_id");

-- AddForeignKey
ALTER TABLE "expense_group_members" ADD CONSTRAINT "expense_group_members_budget_account_id_fkey" FOREIGN KEY ("budget_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_group_members" ADD CONSTRAINT "expense_group_members_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_links" ADD CONSTRAINT "group_cash_links_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "expense_group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_links" ADD CONSTRAINT "group_cash_links_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_links" ADD CONSTRAINT "group_cash_links_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_suggestions" ADD CONSTRAINT "group_cash_suggestions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "expense_group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_suggestions" ADD CONSTRAINT "group_cash_suggestions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cash_suggestions" ADD CONSTRAINT "group_cash_suggestions_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

