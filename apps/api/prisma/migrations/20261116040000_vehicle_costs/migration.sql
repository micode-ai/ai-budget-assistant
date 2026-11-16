-- ABA-803: non-fuel vehicle costs and the vehicle's category rules.
ALTER TABLE "vehicles" ADD COLUMN "category_rules" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "vehicle_costs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_costs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_costs_expense_id_key" ON "vehicle_costs"("expense_id");
CREATE INDEX "vehicle_costs_vehicle_id_idx" ON "vehicle_costs"("vehicle_id");
CREATE INDEX "vehicle_costs_account_id_idx" ON "vehicle_costs"("account_id");

ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
