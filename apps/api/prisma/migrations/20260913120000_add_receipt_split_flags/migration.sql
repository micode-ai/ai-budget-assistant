-- CreateTable
CREATE TABLE "receipt_split_flags" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "item_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "receipt_split_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_split_flags_participant_id_idx" ON "receipt_split_flags"("participant_id");

-- CreateIndex
CREATE INDEX "receipt_split_flags_expense_id_idx" ON "receipt_split_flags"("expense_id");

-- AddForeignKey
ALTER TABLE "receipt_split_flags" ADD CONSTRAINT "receipt_split_flags_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "receipt_split_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
