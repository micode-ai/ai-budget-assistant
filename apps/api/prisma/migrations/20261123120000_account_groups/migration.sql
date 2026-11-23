-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_group_accounts" (
    "group_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "account_group_accounts_pkey" PRIMARY KEY ("group_id","account_id")
);

-- CreateIndex
CREATE INDEX "account_groups_user_id_idx" ON "account_groups"("user_id");

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_group_accounts" ADD CONSTRAINT "account_group_accounts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "account_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_group_accounts" ADD CONSTRAINT "account_group_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
