-- CreateTable
CREATE TABLE "community_store_geo" (
    "id" TEXT NOT NULL,
    "merchant_normalized" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_store_geo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_store_geo_key" ON "community_store_geo"("merchant_normalized", "region");
