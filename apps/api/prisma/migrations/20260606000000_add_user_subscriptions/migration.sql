-- AddColumn notifySubscriptionRenewals to users
ALTER TABLE "users" ADD COLUMN "notify_subscription_renewals" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable user_subscriptions
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "billing_cycle" TEXT NOT NULL,
    "next_renewal_date" DATE NOT NULL,
    "category_id" TEXT,
    "notes" TEXT,
    "detected_from" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_subscriptions_account_id_is_active_idx" ON "user_subscriptions"("account_id", "is_active");

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
