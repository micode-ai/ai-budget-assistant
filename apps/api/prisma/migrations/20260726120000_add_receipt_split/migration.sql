-- AlterTable
ALTER TABLE "users" ADD COLUMN     "payment_handle" TEXT,
ADD COLUMN     "payment_method" "SettleMethod";

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "is_split_receivable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "receipt_split_participants" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "item_ids" JSONB,
    "debt_expense_id" TEXT,
    "opened_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_split_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_split_participants_token_key" ON "receipt_split_participants"("token");

-- CreateIndex
CREATE INDEX "receipt_split_participants_expense_id_idx" ON "receipt_split_participants"("expense_id");

-- AddForeignKey
ALTER TABLE "receipt_split_participants" ADD CONSTRAINT "receipt_split_participants_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
