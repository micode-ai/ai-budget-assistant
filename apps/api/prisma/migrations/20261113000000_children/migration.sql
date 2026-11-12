-- AlterTable
ALTER TABLE "expense_items" ADD COLUMN     "child_id" TEXT;

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "child_benefit_child_id" TEXT;

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "archived_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "encrypted_payload" TEXT,
    "encryption_key_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_children" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "share" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_child_rules" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_child_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "children_account_id_idx" ON "children"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "children_account_id_name_key" ON "children"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "children_account_id_client_id_key" ON "children"("account_id", "client_id");

-- CreateIndex
CREATE INDEX "expense_children_expense_id_idx" ON "expense_children"("expense_id");

-- CreateIndex
CREATE INDEX "expense_children_child_id_idx" ON "expense_children"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_children_expense_id_child_id_key" ON "expense_children"("expense_id", "child_id");

-- CreateIndex
CREATE INDEX "product_child_rules_child_id_idx" ON "product_child_rules"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_child_rules_account_id_product_key_key" ON "product_child_rules"("account_id", "product_key");

-- CreateIndex
CREATE INDEX "expense_items_child_id_idx" ON "expense_items"("child_id");

-- CreateIndex
CREATE INDEX "incomes_child_benefit_child_id_idx" ON "incomes"("child_benefit_child_id");

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_child_benefit_child_id_fkey" FOREIGN KEY ("child_benefit_child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_children" ADD CONSTRAINT "expense_children_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_children" ADD CONSTRAINT "expense_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_child_rules" ADD CONSTRAINT "product_child_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_child_rules" ADD CONSTRAINT "product_child_rules_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

