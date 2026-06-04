-- CreateTable
CREATE TABLE "slack_links" (
    "id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "slack_team_id" TEXT NOT NULL,
    "slack_profile_name" TEXT,
    "user_id" TEXT NOT NULL,
    "default_account_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_link_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_links_slack_user_id_key" ON "slack_links"("slack_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_links_user_id_key" ON "slack_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_link_codes_code_key" ON "slack_link_codes"("code");

-- CreateIndex
CREATE INDEX "slack_link_codes_code_idx" ON "slack_link_codes"("code");

-- CreateIndex
CREATE INDEX "slack_link_codes_user_id_idx" ON "slack_link_codes"("user_id");

-- AddForeignKey
ALTER TABLE "slack_links" ADD CONSTRAINT "slack_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_links" ADD CONSTRAINT "slack_links_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_link_codes" ADD CONSTRAINT "slack_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
