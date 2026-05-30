-- Add clientId to tags so the server can reconcile mobile-local tag ids
-- (offline-first), mirroring the expense clientId pattern. Nullable: existing
-- tags keep NULL and Postgres treats NULLs as distinct, so the unique index
-- allows many NULLs per account.

-- AlterTable
ALTER TABLE "tags" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tags_account_id_client_id_key" ON "tags"("account_id", "client_id");
