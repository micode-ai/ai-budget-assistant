-- AlterTable
-- Nullable on purpose: existing rows keep NULL, and StoryService treats a NULL (or
-- mismatched) currency as a cache miss so the story is regenerated in the caller's
-- display currency instead of being served with amounts narrated in another one.
ALTER TABLE "spending_stories" ADD COLUMN "currency_code" TEXT;
