-- AlterTable
ALTER TABLE "users" ADD COLUMN     "leaflet_consent_notice_at" TIMESTAMP(3),
ADD COLUMN     "notify_leaflet_promos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "leaflet_pages_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "leaflets" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'personal',
    "source" TEXT NOT NULL,
    "platform" TEXT,
    "chain" TEXT,
    "valid_from" DATE,
    "valid_to" DATE,
    "currency_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reading',
    "pages_read" INTEGER NOT NULL DEFAULT 0,
    "pages_unreadable" INTEGER NOT NULL DEFAULT 0,
    "pages_dropped" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "unpublished_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaflets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaflet_items" (
    "id" TEXT NOT NULL,
    "leaflet_id" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "promo_price" DECIMAL(12,2) NOT NULL,
    "regular_price" DECIMAL(12,2),
    "currency_code" TEXT NOT NULL,
    "condition" TEXT,
    "valid_from" DATE,
    "valid_to" DATE,
    "basket_name" TEXT,
    "usual_price" DECIMAL(12,2),
    "added_to_list_at" TIMESTAMP(3),

    CONSTRAINT "leaflet_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaflets_account_id_expires_at_idx" ON "leaflets"("account_id", "expires_at");

-- CreateIndex
CREATE INDEX "leaflets_kind_published_at_idx" ON "leaflets"("kind", "published_at");

-- CreateIndex
CREATE INDEX "leaflet_items_leaflet_id_idx" ON "leaflet_items"("leaflet_id");

-- AddForeignKey
ALTER TABLE "leaflets" ADD CONSTRAINT "leaflets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaflets" ADD CONSTRAINT "leaflets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaflet_items" ADD CONSTRAINT "leaflet_items_leaflet_id_fkey" FOREIGN KEY ("leaflet_id") REFERENCES "leaflets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

