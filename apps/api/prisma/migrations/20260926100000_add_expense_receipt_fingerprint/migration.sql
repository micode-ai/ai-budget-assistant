-- ABA-603: fingerprint of the scanned receipt file, so a re-upload of the same
-- file is flagged before OCR spends an AI request. Nullable: older expenses
-- have none and are caught only by the post-OCR merchant/amount/date match.
ALTER TABLE "expenses" ADD COLUMN "receipt_fingerprint" TEXT;

CREATE INDEX "expenses_account_id_receipt_fingerprint_idx" ON "expenses"("account_id", "receipt_fingerprint");
