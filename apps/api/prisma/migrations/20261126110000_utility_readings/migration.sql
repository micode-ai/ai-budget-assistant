-- CreateTable
CREATE TABLE "utility_readings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "consumption" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "property_label" TEXT,
    "unit_price" DECIMAL(14,5) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utility_readings_expense_id_key" ON "utility_readings"("expense_id");

-- CreateIndex
CREATE INDEX "utility_readings_account_id_kind_idx" ON "utility_readings"("account_id", "kind");

-- AddForeignKey
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
