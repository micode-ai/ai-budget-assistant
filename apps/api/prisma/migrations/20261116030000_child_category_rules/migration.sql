-- ABA-802: a child's expense categories, and where an expense-child link came from.
ALTER TABLE "children" ADD COLUMN "category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "expense_children" ADD COLUMN "source" TEXT;
