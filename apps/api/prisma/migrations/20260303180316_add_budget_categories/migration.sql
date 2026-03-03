-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_categories_budget_id_idx" ON "budget_categories"("budget_id");

-- CreateIndex
CREATE INDEX "budget_categories_category_id_idx" ON "budget_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_budget_id_category_id_key" ON "budget_categories"("budget_id", "category_id");

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
