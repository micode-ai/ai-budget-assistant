-- AlterTable
ALTER TABLE "group_expenses" ADD COLUMN     "claims_open_until" TIMESTAMP(3),
ADD COLUMN     "discount_amount" DECIMAL(12,2),
ADD COLUMN     "itemized" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "group_expense_items" (
    "id" TEXT NOT NULL,
    "group_expense_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "line_discount" DECIMAL(12,2),
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_item_claims" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "share_bp" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_item_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_expense_items_group_expense_id_idx" ON "group_expense_items"("group_expense_id");

-- CreateIndex
CREATE INDEX "group_item_claims_member_id_idx" ON "group_item_claims"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_item_claims_item_id_member_id_key" ON "group_item_claims"("item_id", "member_id");

-- AddForeignKey
ALTER TABLE "group_expense_items" ADD CONSTRAINT "group_expense_items_group_expense_id_fkey" FOREIGN KEY ("group_expense_id") REFERENCES "group_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_item_claims" ADD CONSTRAINT "group_item_claims_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "group_expense_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_item_claims" ADD CONSTRAINT "group_item_claims_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "expense_group_members"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

