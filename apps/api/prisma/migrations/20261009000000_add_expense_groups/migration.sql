-- CreateEnum
CREATE TYPE "ExpenseGroupStatus" AS ENUM ('active', 'archived');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_group_activity" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "expense_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "currency_code" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "guest_token" TEXT NOT NULL,
    "guest_access" BOOLEAN NOT NULL DEFAULT true,
    "status" "ExpenseGroupStatus" NOT NULL DEFAULT 'active',
    "ledger_version" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "claim_token_hash" TEXT,
    "claimed_at" TIMESTAMP(3),
    "payment_method" "SettleMethod",
    "payment_handle" TEXT,
    "removed_at" TIMESTAMP(3),
    "removed_by_owner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_expenses" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "paid_by_member_id" TEXT NOT NULL,
    "split_type" "ShareType" NOT NULL,
    "created_by_member_id" TEXT NOT NULL,
    "client_request_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_expense_shares" (
    "id" TEXT NOT NULL,
    "group_expense_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "share_value" DECIMAL(12,4),
    "share_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "group_expense_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_settlements" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "from_member_id" TEXT NOT NULL,
    "to_member_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "SettleMethod",
    "recorded_by_member_id" TEXT NOT NULL,
    "client_request_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_groups_guest_token_key" ON "expense_groups"("guest_token");

-- CreateIndex
CREATE INDEX "expense_groups_owner_user_id_idx" ON "expense_groups"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_group_members_claim_token_hash_key" ON "expense_group_members"("claim_token_hash");

-- CreateIndex
CREATE INDEX "expense_group_members_user_id_idx" ON "expense_group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_group_members_group_id_name_key_key" ON "expense_group_members"("group_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "expense_group_members_group_id_user_id_key" ON "expense_group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "group_expenses_group_id_deleted_at_date_idx" ON "group_expenses"("group_id", "deleted_at", "date");

-- CreateIndex
CREATE UNIQUE INDEX "group_expenses_group_id_client_request_id_key" ON "group_expenses"("group_id", "client_request_id");

-- CreateIndex
CREATE INDEX "group_expense_shares_member_id_idx" ON "group_expense_shares"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_expense_shares_group_expense_id_member_id_key" ON "group_expense_shares"("group_expense_id", "member_id");

-- CreateIndex
CREATE INDEX "group_settlements_group_id_voided_at_idx" ON "group_settlements"("group_id", "voided_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_settlements_group_id_client_request_id_key" ON "group_settlements"("group_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_group_members" ADD CONSTRAINT "expense_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_group_members" ADD CONSTRAINT "expense_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expense_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expense_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_paid_by_member_id_fkey" FOREIGN KEY ("paid_by_member_id") REFERENCES "expense_group_members"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expense_shares" ADD CONSTRAINT "group_expense_shares_group_expense_id_fkey" FOREIGN KEY ("group_expense_id") REFERENCES "group_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expense_shares" ADD CONSTRAINT "group_expense_shares_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "expense_group_members"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_settlements" ADD CONSTRAINT "group_settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expense_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_settlements" ADD CONSTRAINT "group_settlements_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "expense_group_members"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_settlements" ADD CONSTRAINT "group_settlements_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "expense_group_members"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

