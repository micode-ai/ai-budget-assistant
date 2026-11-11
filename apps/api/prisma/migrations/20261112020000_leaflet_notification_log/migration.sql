-- CreateTable
CREATE TABLE "leaflet_notification_log" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),

    CONSTRAINT "leaflet_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaflet_notification_log_account_id_type_sent_at_idx" ON "leaflet_notification_log"("account_id", "type", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "leaflet_notification_log_account_id_dedup_key_key" ON "leaflet_notification_log"("account_id", "dedup_key");

-- AddForeignKey
ALTER TABLE "leaflet_notification_log" ADD CONSTRAINT "leaflet_notification_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

