-- ABA-654: multi-currency group expenses, converted ONCE at write time.
-- All nullable and additive; NULL means "entered in the group currency", so existing rows need no
-- backfill (their amount already is the group-currency figure).

-- AlterTable
ALTER TABLE "group_expenses" ADD COLUMN     "fx_rate" DECIMAL(18,8),
ADD COLUMN     "fx_rate_at" TIMESTAMP(3),
ADD COLUMN     "fx_rate_source" TEXT,
ADD COLUMN     "original_amount" DECIMAL(12,2),
ADD COLUMN     "original_currency" TEXT;
