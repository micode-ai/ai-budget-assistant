-- Backfill: for each budget that has category_id set but no active budget_categories rows,
-- create a budget_categories row using the budget's own amount as the allocation amount.
INSERT INTO budget_categories (id, budget_id, category_id, amount, is_deleted, sync_version, created_at, updated_at)
SELECT
  gen_random_uuid(),
  b.id,
  b.category_id,
  b.amount,
  false,
  0,
  NOW(),
  NOW()
FROM budgets b
WHERE b.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM budget_categories bc
    WHERE bc.budget_id = b.id AND bc.is_deleted = false
  );

-- Drop foreign-key constraint and index before removing the column
ALTER TABLE "budgets" DROP CONSTRAINT IF EXISTS "budgets_category_id_fkey";
DROP INDEX IF EXISTS "budgets_category_id_idx";

-- AlterTable: remove the legacy single-category column
ALTER TABLE "budgets" DROP COLUMN "category_id";
