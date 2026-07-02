-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('active', 'settling', 'archived');

-- CreateEnum
CREATE TYPE "ShareType" AS ENUM ('equal', 'exact', 'percentage', 'shares');

-- CreateEnum
CREATE TYPE "SettleMethod" AS ENUM ('blik', 'revolut', 'paypal', 'cash', 'other');

-- CreateEnum
CREATE TYPE "SettleStatus" AS ENUM ('pending', 'confirmed');

-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'trip';

-- AlterTable
ALTER TABLE "account_members" ADD COLUMN     "payment_handle" TEXT,
ADD COLUMN     "payment_method" "SettleMethod";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "trip_end_date" DATE,
ADD COLUMN     "trip_start_date" DATE,
ADD COLUMN     "trip_status" "TripStatus";

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid_by_user_id" TEXT;

-- CreateTable
CREATE TABLE "trip_expense_shares" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "share_type" "ShareType" NOT NULL,
    "share_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_expense_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settle_up_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "SettleMethod",
    "status" "SettleStatus" NOT NULL DEFAULT 'pending',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settle_up_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_expense_shares_user_id_idx" ON "trip_expense_shares"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_expense_shares_expense_id_user_id_key" ON "trip_expense_shares"("expense_id", "user_id");

-- CreateIndex
CREATE INDEX "settle_up_transactions_account_id_idx" ON "settle_up_transactions"("account_id");

-- AddForeignKey
ALTER TABLE "trip_expense_shares" ADD CONSTRAINT "trip_expense_shares_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expense_shares" ADD CONSTRAINT "trip_expense_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settle_up_transactions" ADD CONSTRAINT "settle_up_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
