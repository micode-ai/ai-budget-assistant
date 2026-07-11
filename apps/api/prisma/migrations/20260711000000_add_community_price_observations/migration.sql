-- CreateTable
CREATE TABLE "community_price_observations" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "merchant_normalized" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "currency_code" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "contributor_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_obs_dedup_key" ON "community_price_observations"("canonical_name", "merchant_normalized", "region", "week_start", "currency_code", "contributor_key");

-- CreateIndex
CREATE INDEX "community_obs_product_region_week_idx" ON "community_price_observations"("canonical_name", "region", "week_start");

-- CreateIndex
CREATE INDEX "community_obs_week_start_idx" ON "community_price_observations"("week_start");
