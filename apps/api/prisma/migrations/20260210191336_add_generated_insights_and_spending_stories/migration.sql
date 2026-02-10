-- CreateTable
CREATE TABLE "generated_insights" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "insight_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "chart_config" JSONB NOT NULL,
    "action_suggestion" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "is_expired" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_stories" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "blocks" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_insights_account_id_is_expired_created_at_idx" ON "generated_insights"("account_id", "is_expired", "created_at");

-- CreateIndex
CREATE INDEX "spending_stories_account_id_created_at_idx" ON "spending_stories"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "spending_stories_account_id_period_start_period_end_key" ON "spending_stories"("account_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "generated_insights" ADD CONSTRAINT "generated_insights_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_stories" ADD CONSTRAINT "spending_stories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
