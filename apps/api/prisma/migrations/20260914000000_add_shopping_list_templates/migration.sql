-- CreateTable
CREATE TABLE "shopping_list_templates" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_list_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_template_items" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "canonical_name" TEXT,
    "raw_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shopping_list_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_list_templates_account_id_idx" ON "shopping_list_templates"("account_id");

-- CreateIndex
CREATE INDEX "shopping_list_template_items_template_id_idx" ON "shopping_list_template_items"("template_id");

-- AddForeignKey
ALTER TABLE "shopping_list_templates" ADD CONSTRAINT "shopping_list_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_template_items" ADD CONSTRAINT "shopping_list_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shopping_list_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
