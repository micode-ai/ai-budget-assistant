-- Adds a group-picker token to receipt splits (QR-code bill split, ABA — see
-- docs/contracts/qr-code-bill-split-api.md). Set only on the seq:0 ("anchor")
-- row of a split at creation time; NULL for every pre-existing split (no
-- backfill) and for every non-anchor row of a new split. Postgres treats
-- NULLs as distinct under a unique index, so many NULL rows coexist fine.

-- AlterTable
ALTER TABLE "receipt_split_participants" ADD COLUMN "group_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipt_split_participants_group_token_key" ON "receipt_split_participants"("group_token");
