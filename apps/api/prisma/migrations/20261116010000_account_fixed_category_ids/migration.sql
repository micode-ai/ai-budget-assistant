-- ABA-777: the account's own list of expense categories counted as fixed costs.
-- On the account, not on categories: system categories are one global row shared by every account.
ALTER TABLE "accounts" ADD COLUMN "fixed_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
