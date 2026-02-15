-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "encryption_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "encryption_tier" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "key_rotation_needed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "currency_exchanges" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "expense_category_splits" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "expense_items" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "investment_transactions" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "portfolio_holdings" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- AlterTable
ALTER TABLE "wallet_balances" ADD COLUMN     "encrypted_payload" TEXT,
ADD COLUMN     "encryption_key_version" INTEGER;

-- CreateTable
CREATE TABLE "user_encryption_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pbkdf2_salt" TEXT NOT NULL,
    "public_key_x25519" TEXT NOT NULL,
    "public_key_ed25519" TEXT NOT NULL,
    "wrapped_private_key_x25519" TEXT NOT NULL,
    "wrapped_private_key_ed25519" TEXT NOT NULL,
    "recovery_key_hash" TEXT,
    "wrapped_mk_by_recovery" TEXT,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_encryption_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_encryption_keys" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wrapped_account_key" TEXT NOT NULL,
    "wrapped_by" TEXT NOT NULL,
    "wrapping_method" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_encryption_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_encryption_profiles_user_id_key" ON "user_encryption_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_encryption_keys_account_id_user_id_key" ON "account_encryption_keys"("account_id", "user_id");

-- AddForeignKey
ALTER TABLE "user_encryption_profiles" ADD CONSTRAINT "user_encryption_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_encryption_keys" ADD CONSTRAINT "account_encryption_keys_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_encryption_keys" ADD CONSTRAINT "account_encryption_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
