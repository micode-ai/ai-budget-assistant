-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "ai_import_consent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bank_statement_signatures" (
    "id" TEXT NOT NULL,
    "header_fingerprint" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "delimiter" TEXT,
    "amount_format" TEXT,
    "date_format" TEXT,
    "bank_label" TEXT,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "corrected_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_signatures_header_fingerprint_key" ON "bank_statement_signatures"("header_fingerprint");

