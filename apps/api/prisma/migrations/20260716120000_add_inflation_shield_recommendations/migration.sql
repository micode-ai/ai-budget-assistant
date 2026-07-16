-- CreateEnum
CREATE TYPE "ShieldStatus" AS ENUM ('active', 'acted', 'expired');

-- CreateTable
CREATE TABLE "inflation_shield_recommendations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "period_month" TEXT NOT NULL,
    "recommended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price_at_rec" DECIMAL(12,2) NOT NULL,
    "projected_price" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "projected_saving" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "status" "ShieldStatus" NOT NULL DEFAULT 'active',
    "acted_at" TIMESTAMP(3),
    "realized_saving" DECIMAL(12,2),

    CONSTRAINT "inflation_shield_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inflation_shield_recommendations_account_id_status_idx" ON "inflation_shield_recommendations"("account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inflation_shield_recommendations_account_id_canonical_name__key" ON "inflation_shield_recommendations"("account_id", "canonical_name", "period_month");

-- AddForeignKey
ALTER TABLE "inflation_shield_recommendations" ADD CONSTRAINT "inflation_shield_recommendations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

