-- AlterTable
ALTER TABLE "generated_reports" ALTER COLUMN "account_id" DROP NOT NULL,
ADD COLUMN     "account_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
