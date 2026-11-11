-- CreateTable
CREATE TABLE "community_promo_observations" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "promo_price" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "condition" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "contributor_key" TEXT NOT NULL,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "admin_leaflet_id" TEXT,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_promo_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_promo_observations_valid_to_idx" ON "community_promo_observations"("valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "community_promo_dedup_key" ON "community_promo_observations"("chain", "canonical_name", "promo_price", "currency_code", "valid_from", "valid_to", "contributor_key");

