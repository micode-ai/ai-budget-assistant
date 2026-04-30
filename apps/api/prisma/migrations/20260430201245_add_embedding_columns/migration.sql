-- AlterTable
ALTER TABLE "categories" ADD COLUMN "embedding" JSONB;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN "embedding" JSONB;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "embedding" JSONB;
