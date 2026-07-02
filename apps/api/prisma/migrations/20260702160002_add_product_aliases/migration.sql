-- CreateTable
CREATE TABLE "product_aliases" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "raw_name" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_account_id_raw_name_key" ON "product_aliases"("account_id", "raw_name");

-- CreateIndex
CREATE INDEX "product_aliases_account_id_idx" ON "product_aliases"("account_id");

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
