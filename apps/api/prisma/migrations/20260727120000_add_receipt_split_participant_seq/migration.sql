-- AlterTable
ALTER TABLE "receipt_split_participants" ADD COLUMN     "seq" INTEGER NOT NULL;

-- Partial unique index: at most one LIVE split "slot" per expense. A cancelled
-- participant row (cancelled_at IS NOT NULL) drops out of the index, so a
-- re-split after a cancel is free to reuse seq 0 without colliding against the
-- old dead row. Two concurrent creates for the same expense both attempt to
-- insert live (expense_id, 0) — one wins, the other gets a P2002 caught outside
-- the transaction by ReceiptSplitService.createSplit (see the comment there for
-- why the catch must live outside the $transaction).
--
-- Style precedent: budget_alert_overall_unique (migration
-- 20260702152451_add_budget_category_alert), a partial unique index on the same
-- "WHERE <nullable-column> IS NULL" shape. Prisma cannot express a partial
-- index in schema.prisma, so this is hand-written rather than generated.
CREATE UNIQUE INDEX "receipt_split_live_slot"
  ON "receipt_split_participants"("expense_id", "seq")
  WHERE "cancelled_at" IS NULL;
