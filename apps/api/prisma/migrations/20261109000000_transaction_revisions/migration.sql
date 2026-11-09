-- CreateTable
CREATE TABLE "transaction_revisions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_revisions_entity_type_entity_id_created_at_idx" ON "transaction_revisions"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transaction_revisions_account_id_idx" ON "transaction_revisions"("account_id");

-- AddForeignKey
ALTER TABLE "transaction_revisions" ADD CONSTRAINT "transaction_revisions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_revisions" ADD CONSTRAINT "transaction_revisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
