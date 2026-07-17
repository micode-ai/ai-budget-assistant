-- CreateTable
CREATE TABLE "shopping_notification_log" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_notification_log_account_id_dedup_key_key" ON "shopping_notification_log"("account_id", "dedup_key");

-- CreateIndex
CREATE INDEX "shopping_notification_log_account_id_type_sent_at_idx" ON "shopping_notification_log"("account_id", "type", "sent_at");

-- AddForeignKey
ALTER TABLE "shopping_notification_log" ADD CONSTRAINT "shopping_notification_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
