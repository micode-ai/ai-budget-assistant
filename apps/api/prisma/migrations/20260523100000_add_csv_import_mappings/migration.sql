-- CreateTable
CREATE TABLE "csv_import_mappings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "header_fingerprint" TEXT NOT NULL,
    "bank_id" TEXT,
    "mapping" JSONB NOT NULL,
    "delimiter" TEXT NOT NULL DEFAULT ';',
    "encoding" TEXT NOT NULL DEFAULT 'utf-8',
    "amount_format" TEXT NOT NULL DEFAULT 'polish',
    "date_format" TEXT NOT NULL DEFAULT 'auto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csv_import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "csv_import_mappings_account_id_header_fingerprint_key" ON "csv_import_mappings"("account_id", "header_fingerprint");

-- CreateIndex
CREATE INDEX "csv_import_mappings_account_id_idx" ON "csv_import_mappings"("account_id");

-- AddForeignKey
ALTER TABLE "csv_import_mappings" ADD CONSTRAINT "csv_import_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
