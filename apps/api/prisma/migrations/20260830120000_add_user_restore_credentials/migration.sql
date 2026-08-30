-- CreateTable
CREATE TABLE "user_restore_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "user_restore_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_restore_credentials_credential_id_key" ON "user_restore_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "user_restore_credentials_user_id_idx" ON "user_restore_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "user_restore_credentials" ADD CONSTRAINT "user_restore_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
