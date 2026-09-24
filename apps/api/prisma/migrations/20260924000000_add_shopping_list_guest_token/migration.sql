-- Add a nullable guest-share-link token to shopping_lists
-- (shopping-list-guest-share-link). Null = no active link. Nullable and
-- unique: Postgres treats every NULL as distinct, so the unique index allows
-- any number of lists with no active link.

-- AlterTable
ALTER TABLE "shopping_lists" ADD COLUMN "guest_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shopping_lists_guest_token_key" ON "shopping_lists"("guest_token");
