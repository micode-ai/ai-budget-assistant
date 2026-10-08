-- ABA-642: anti-Sybil layer for the Community Price Map.
--
-- NON-DESTRUCTIVE by decision (deviates from the design spec, which truncated both
-- tables): every existing observation and store-geo row is kept. Existing observation
-- rows get `attested = false` and are excluded from every read by construction (they
-- were contributed without a server-signed scan and keyed per account). Existing
-- store-geo rows get `attested = false` too: they are never overwritten and never
-- shown; `attested` joins the unique key so a legacy pin cannot block a real one.

-- DropIndex
DROP INDEX "community_store_geo_key";

-- AlterTable
ALTER TABLE "community_price_observations" ADD COLUMN     "attested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trusted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ingest_week" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "community_store_geo" ADD COLUMN     "attested" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "community_store_pin_candidates" (
    "id" TEXT NOT NULL,
    "merchant_normalized" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "contributor_key" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_store_pin_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_pin_candidate_key" ON "community_store_pin_candidates"("merchant_normalized", "region", "contributor_key");

-- CreateIndex
CREATE INDEX "community_pin_candidate_created_idx" ON "community_store_pin_candidates"("created_at");

-- CreateTable
CREATE TABLE "community_receipt_seen" (
    "content_key" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_receipt_seen_pkey" PRIMARY KEY ("content_key")
);

-- CreateIndex
CREATE INDEX "community_receipt_seen_week_idx" ON "community_receipt_seen"("week_start");

-- CreateIndex
CREATE INDEX "community_obs_contributor_week_idx" ON "community_price_observations"("contributor_key", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "community_store_geo_key" ON "community_store_geo"("merchant_normalized", "region", "attested");

