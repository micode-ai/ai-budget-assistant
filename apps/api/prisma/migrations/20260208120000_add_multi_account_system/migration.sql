-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('personal', 'business', 'shared');

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- AlterTable: Add default_account_id to users
ALTER TABLE "users" ADD COLUMN "default_account_id" TEXT;

-- CreateTable: accounts
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "owner_id" TEXT NOT NULL,
    "icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_members
CREATE TABLE "account_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_invitations
CREATE TABLE "account_invitations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "invited_email" TEXT,
    "invite_code" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'editor',
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_members_account_id_user_id_key" ON "account_members"("account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_invitations_invite_code_key" ON "account_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "account_invitations_invite_code_idx" ON "account_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "account_invitations_invited_email_idx" ON "account_invitations"("invited_email");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 1: Add nullable account_id columns to existing tables
ALTER TABLE "expenses" ADD COLUMN "account_id" TEXT;
ALTER TABLE "budgets" ADD COLUMN "account_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "account_id" TEXT;
ALTER TABLE "sync_log" ADD COLUMN "account_id" TEXT;

-- Step 2: Data migration - create default personal accounts for existing users
-- Generate a personal account for each existing user
INSERT INTO "accounts" ("id", "name", "type", "currency_code", "owner_id", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    'Personal',
    'personal',
    "currency_code",
    "id",
    NOW(),
    NOW()
FROM "users";

-- Create AccountMember entries (owner) for each account
INSERT INTO "account_members" ("id", "account_id", "user_id", "role", "joined_at", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    a."id",
    a."owner_id",
    'owner',
    NOW(),
    NOW(),
    NOW()
FROM "accounts" a;

-- Set default_account_id for users
UPDATE "users" u
SET "default_account_id" = a."id"
FROM "accounts" a
WHERE a."owner_id" = u."id";

-- Assign existing expenses to the user's default personal account
UPDATE "expenses" e
SET "account_id" = a."id"
FROM "accounts" a
WHERE a."owner_id" = e."user_id";

-- Assign existing budgets to the user's default personal account
UPDATE "budgets" b
SET "account_id" = a."id"
FROM "accounts" a
WHERE a."owner_id" = b."user_id";

-- Assign existing custom categories to the user's default personal account
UPDATE "categories" c
SET "account_id" = a."id"
FROM "accounts" a
WHERE a."owner_id" = c."user_id" AND c."is_system" = false;

-- Step 3: Make account_id NOT NULL on expenses and budgets
ALTER TABLE "expenses" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "budgets" ALTER COLUMN "account_id" SET NOT NULL;

-- Step 4: Drop old unique constraints and indexes, create new ones

-- Expenses: change unique and index from userId to accountId
DROP INDEX IF EXISTS "expenses_user_id_client_id_key";
DROP INDEX IF EXISTS "expenses_user_id_date_idx";
CREATE UNIQUE INDEX "expenses_account_id_client_id_key" ON "expenses"("account_id", "client_id");
CREATE INDEX "expenses_account_id_date_idx" ON "expenses"("account_id", "date" DESC);

-- Budgets: change unique and index from userId to accountId
DROP INDEX IF EXISTS "budgets_user_id_client_id_key";
DROP INDEX IF EXISTS "budgets_user_id_is_active_idx";
CREATE UNIQUE INDEX "budgets_account_id_client_id_key" ON "budgets"("account_id", "client_id");
CREATE INDEX "budgets_account_id_is_active_idx" ON "budgets"("account_id", "is_active");

-- Categories: change unique from userId to accountId
DROP INDEX IF EXISTS "categories_user_id_name_type_key";
CREATE UNIQUE INDEX "categories_account_id_name_type_key" ON "categories"("account_id", "name", "type");

-- Step 5: Add foreign keys for account_id
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
