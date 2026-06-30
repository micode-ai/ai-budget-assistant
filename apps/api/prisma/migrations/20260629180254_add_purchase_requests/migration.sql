-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PURCHASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalRule" AS ENUM ('MAJORITY', 'UNANIMOUS', 'OWNER_ONLY');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('APPROVE', 'REJECT', 'ABSTAIN');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "purchase_approval_rule" "ApprovalRule" NOT NULL DEFAULT 'MAJORITY';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "is_planned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_purchase_requests" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "category_id" TEXT,
    "merchant" TEXT,
    "image_url" TEXT,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approval_rule" "ApprovalRule" NOT NULL,
    "planned_expense_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_votes" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vote" "VoteChoice" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_planned_expense_id_key" ON "purchase_requests"("planned_expense_id");

-- CreateIndex
CREATE INDEX "purchase_requests_account_id_status_idx" ON "purchase_requests"("account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_votes_request_id_user_id_key" ON "purchase_request_votes"("request_id", "user_id");

-- CreateIndex
CREATE INDEX "expenses_account_id_is_planned_idx" ON "expenses"("account_id", "is_planned");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_planned_expense_id_fkey" FOREIGN KEY ("planned_expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_votes" ADD CONSTRAINT "purchase_request_votes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_votes" ADD CONSTRAINT "purchase_request_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
