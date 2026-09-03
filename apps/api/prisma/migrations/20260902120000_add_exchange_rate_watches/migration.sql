-- CreateEnum
CREATE TYPE "RateWatchDirection" AS ENUM ('above', 'below');

-- CreateTable
CREATE TABLE "exchange_rate_watches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "target_rate" DECIMAL(12,6) NOT NULL,
    "direction" "RateWatchDirection" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_at" TIMESTAMP(3),
    "triggered_rate" DECIMAL(12,6),

    CONSTRAINT "exchange_rate_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rate_watches_user_id_idx" ON "exchange_rate_watches"("user_id");

-- CreateIndex
CREATE INDEX "exchange_rate_watches_is_active_from_currency_idx" ON "exchange_rate_watches"("is_active", "from_currency");

-- AddForeignKey
ALTER TABLE "exchange_rate_watches" ADD CONSTRAINT "exchange_rate_watches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
