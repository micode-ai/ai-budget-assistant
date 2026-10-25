CREATE TABLE "wallet_adjustments" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "balance_before" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_adjustments_account_id_currency_code_idx" ON "wallet_adjustments"("account_id", "currency_code");

ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
