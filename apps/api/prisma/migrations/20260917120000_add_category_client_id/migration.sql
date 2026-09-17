-- Add clientId to categories so the server can reconcile mobile-local category ids
-- (offline-first), mirroring the tag clientId pattern. Nullable: existing
-- categories keep NULL and Postgres treats NULLs as distinct, so the unique index
-- allows many NULLs per account.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "categories_account_id_client_id_key" ON "categories"("account_id", "client_id");
