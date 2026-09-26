-- Real salary (plan 2026-09-26-real-salary-api)
ALTER TABLE "users" ADD COLUMN "inflation_country" TEXT;
ALTER TABLE "categories" ADD COLUMN "coicop_division" TEXT;

CREATE TABLE "official_inflation_rates" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "annual_rate_pct" DECIMAL(6,2) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "official_inflation_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "official_inflation_rates_country_division_month_key"
    ON "official_inflation_rates"("country", "division", "month");
CREATE INDEX "official_inflation_rates_country_month_idx"
    ON "official_inflation_rates"("country", "month");

CREATE TABLE "salary_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "salary_key" TEXT,
    "manual_previous_monthly" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_profiles_user_id_account_id_key"
    ON "salary_profiles"("user_id", "account_id");
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
