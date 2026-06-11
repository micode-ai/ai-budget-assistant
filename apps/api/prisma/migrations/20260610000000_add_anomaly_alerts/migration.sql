-- AddColumn notifyAnomalyAlerts to users
ALTER TABLE "users" ADD COLUMN "notify_anomaly_alerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable anomaly_alerts
CREATE TABLE "anomaly_alerts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "expense_id" TEXT,
    "category_id" TEXT,
    "push_sent" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_alerts_account_id_dedup_key_key" ON "anomaly_alerts"("account_id", "dedup_key");

-- CreateIndex
CREATE INDEX "anomaly_alerts_account_id_created_at_idx" ON "anomaly_alerts"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
