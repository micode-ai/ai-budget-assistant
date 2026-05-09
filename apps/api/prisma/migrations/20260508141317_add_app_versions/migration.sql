-- CreateEnum
CREATE TYPE "app_platform" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "platform" "app_platform" NOT NULL,
    "latest_version" TEXT NOT NULL,
    "min_supported_version" TEXT NOT NULL,
    "release_notes" JSONB,
    "store_url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_versions_platform_published_at_idx" ON "app_versions"("platform", "published_at" DESC);
