CREATE TABLE "merchant_category_rules" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "merchant_normalized" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_category_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_category_rules_account_id_merchant_normalized_key" ON "merchant_category_rules"("account_id", "merchant_normalized");
CREATE INDEX "merchant_category_rules_account_id_idx" ON "merchant_category_rules"("account_id");

ALTER TABLE "merchant_category_rules" ADD CONSTRAINT "merchant_category_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchant_category_rules" ADD CONSTRAINT "merchant_category_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
