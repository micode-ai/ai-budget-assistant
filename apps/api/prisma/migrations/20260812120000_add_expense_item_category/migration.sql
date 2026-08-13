ALTER TABLE "expense_items" ADD COLUMN "category_id" TEXT;

ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "expense_items_category_id_idx" ON "expense_items"("category_id");
