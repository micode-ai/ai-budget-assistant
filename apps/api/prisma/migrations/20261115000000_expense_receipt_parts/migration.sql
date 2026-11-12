-- CreateTable
CREATE TABLE "expense_receipt_parts" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_receipt_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_receipt_parts_expense_id_index_key" ON "expense_receipt_parts"("expense_id", "index");

-- AddForeignKey
ALTER TABLE "expense_receipt_parts" ADD CONSTRAINT "expense_receipt_parts_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

