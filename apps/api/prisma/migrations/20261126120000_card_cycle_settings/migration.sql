-- CreateTable
CREATE TABLE "card_cycle_settings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "statement_day" INTEGER NOT NULL,
    "due_day" INTEGER NOT NULL,
    "credit_limit" DECIMAL(12,2),
    "last_reminded_due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_cycle_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_cycle_settings_account_id_key" ON "card_cycle_settings"("account_id");

-- AddForeignKey
ALTER TABLE "card_cycle_settings" ADD CONSTRAINT "card_cycle_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
