-- CreateEnum
CREATE TYPE "oauth_client_status" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "oauth_token_kind" AS ENUM ('access', 'refresh');

-- CreateEnum
CREATE TYPE "oauth_revoked_by" AS ENUM ('user', 'client', 'admin', 'reuse_detected', 'client_deleted');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "created_by_oauth_client_id" TEXT;

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "secret_hash" TEXT,
    "is_confidential" BOOLEAN NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "homepage_url" TEXT NOT NULL,
    "privacy_policy_url" TEXT,
    "redirect_uris" TEXT[],
    "status" "oauth_client_status" NOT NULL DEFAULT 'active',
    "blocked_reason" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "rate_limit_per_grant" INTEGER,
    "rate_limit_per_client" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_grants" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" "oauth_revoked_by",

    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "kind" "oauth_token_kind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

-- CreateIndex
CREATE INDEX "oauth_clients_owner_user_id_idx" ON "oauth_clients"("owner_user_id");

-- CreateIndex
CREATE INDEX "oauth_grants_account_id_idx" ON "oauth_grants"("account_id");

-- CreateIndex
CREATE INDEX "oauth_grants_user_id_idx" ON "oauth_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_token_hash_key" ON "oauth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_tokens_expires_at_idx" ON "oauth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "expenses_account_id_updated_at_id_idx" ON "expenses"("account_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "expenses_created_by_oauth_client_id_idx" ON "expenses"("created_by_oauth_client_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_oauth_client_id_fkey" FOREIGN KEY ("created_by_oauth_client_id") REFERENCES "oauth_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "oauth_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active grant per (client, user, account). Prisma cannot model a partial index; do not let a later
-- migrate dev drop it (schema-guard.spec.ts).
CREATE UNIQUE INDEX oauth_grants_active_key ON oauth_grants (client_id, user_id, account_id) WHERE revoked_at IS NULL;
