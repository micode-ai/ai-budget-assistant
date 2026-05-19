-- CreateTable
CREATE TABLE "whatsapp_links" (
    "id" TEXT NOT NULL,
    "wa_phone_number" TEXT NOT NULL,
    "wa_profile_name" TEXT,
    "user_id" TEXT NOT NULL,
    "default_account_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_link_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_wa_phone_number_key" ON "whatsapp_links"("wa_phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_links_user_id_key" ON "whatsapp_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_link_codes_code_key" ON "whatsapp_link_codes"("code");

-- CreateIndex
CREATE INDEX "whatsapp_link_codes_code_idx" ON "whatsapp_link_codes"("code");

-- CreateIndex
CREATE INDEX "whatsapp_link_codes_user_id_idx" ON "whatsapp_link_codes"("user_id");

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
