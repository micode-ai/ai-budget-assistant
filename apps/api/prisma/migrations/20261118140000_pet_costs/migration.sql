-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL DEFAULT 'dog',
    "birthday" DATE,
    "next_vaccination_date" DATE,
    "next_parasite_treatment_date" DATE,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_costs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pets_account_id_idx" ON "pets"("account_id");
CREATE UNIQUE INDEX "pet_costs_expense_id_key" ON "pet_costs"("expense_id");
CREATE INDEX "pet_costs_pet_id_idx" ON "pet_costs"("pet_id");
CREATE INDEX "pet_costs_account_id_idx" ON "pet_costs"("account_id");

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_costs" ADD CONSTRAINT "pet_costs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_costs" ADD CONSTRAINT "pet_costs_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_costs" ADD CONSTRAINT "pet_costs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
