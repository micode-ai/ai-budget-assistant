-- CreateTable
CREATE TABLE "client_errors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "platform" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT NOT NULL,
    "component_stack" TEXT NOT NULL,
    "route" TEXT,
    "fatal" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_errors_created_at_idx" ON "client_errors"("created_at");

-- CreateIndex
CREATE INDEX "client_errors_fingerprint_idx" ON "client_errors"("fingerprint");

-- AddForeignKey
ALTER TABLE "client_errors" ADD CONSTRAINT "client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
