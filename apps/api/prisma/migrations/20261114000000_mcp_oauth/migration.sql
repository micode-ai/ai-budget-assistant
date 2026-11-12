-- CreateEnum
CREATE TYPE "oauth_client_source" AS ENUM ('manual', 'mcp_dcr');

-- AlterTable
ALTER TABLE "oauth_clients" ADD COLUMN     "source" "oauth_client_source" NOT NULL DEFAULT 'manual',
ALTER COLUMN "owner_user_id" DROP NOT NULL,
ALTER COLUMN "homepage_url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "oauth_tokens" ADD COLUMN     "resource" TEXT;

-- CreateIndex
CREATE INDEX "oauth_clients_source_created_at_idx" ON "oauth_clients"("source", "created_at");

