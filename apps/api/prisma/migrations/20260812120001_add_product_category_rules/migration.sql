CREATE TABLE "product_category_rules" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "canonical_name_normalized" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_category_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_category_rules_account_id_canonical_name_normalized_key"
  ON "product_category_rules"("account_id", "canonical_name_normalized");
CREATE INDEX "product_category_rules_account_id_idx" ON "product_category_rules"("account_id");

ALTER TABLE "product_category_rules" ADD CONSTRAINT "product_category_rules_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_category_rules" ADD CONSTRAINT "product_category_rules_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
