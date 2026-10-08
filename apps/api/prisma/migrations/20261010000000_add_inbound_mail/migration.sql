-- CreateTable
CREATE TABLE "inbound_mail_addresses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "disabled_at" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_mail_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_receipts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'receipt',
    "status" TEXT NOT NULL DEFAULT 'received',
    "message_id_hash" TEXT NOT NULL,
    "content_hash" TEXT,
    "from_address" TEXT NOT NULL,
    "subject" TEXT,
    "auth_spf" TEXT,
    "auth_dkim" TEXT,
    "auth_dmarc" TEXT,
    "document_kind" TEXT,
    "document_mime" TEXT,
    "document" BYTEA,
    "document_text" TEXT,
    "ignored_attachment_count" INTEGER NOT NULL DEFAULT 0,
    "extraction" JSONB,
    "verification_code" TEXT,
    "expense_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_mail_addresses_user_id_key" ON "inbound_mail_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_mail_addresses_token_key" ON "inbound_mail_addresses"("token");

-- CreateIndex
CREATE INDEX "inbound_receipts_user_id_account_id_status_idx" ON "inbound_receipts"("user_id", "account_id", "status");

-- CreateIndex
CREATE INDEX "inbound_receipts_status_updated_at_idx" ON "inbound_receipts"("status", "updated_at");

-- CreateIndex
CREATE INDEX "inbound_receipts_expires_at_idx" ON "inbound_receipts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_receipts_user_id_message_id_hash_key" ON "inbound_receipts"("user_id", "message_id_hash");

-- AddForeignKey
ALTER TABLE "inbound_mail_addresses" ADD CONSTRAINT "inbound_mail_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_mail_addresses" ADD CONSTRAINT "inbound_mail_addresses_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

