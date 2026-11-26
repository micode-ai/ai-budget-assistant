-- CreateTable
CREATE TABLE "merchant_spending_caps" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_normalized" TEXT NOT NULL,
    "merchant_label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "last_alert_period" TEXT,
    "last_alert_threshold" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_spending_caps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_spending_caps_account_id_idx" ON "merchant_spending_caps"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_spending_caps_account_id_merchant_normalized_key" ON "merchant_spending_caps"("account_id", "merchant_normalized");

-- AddForeignKey
ALTER TABLE "merchant_spending_caps" ADD CONSTRAINT "merchant_spending_caps_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_spending_caps" ADD CONSTRAINT "merchant_spending_caps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
