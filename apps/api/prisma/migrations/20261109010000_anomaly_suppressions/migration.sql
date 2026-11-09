-- CreateTable
CREATE TABLE "anomaly_suppressions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_suppressions_account_id_type_subject_key_key" ON "anomaly_suppressions"("account_id", "type", "subject_key");

-- AddForeignKey
ALTER TABLE "anomaly_suppressions" ADD CONSTRAINT "anomaly_suppressions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
