-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'investment';

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exchange" TEXT,
    "current_price" DECIMAL(16,6),
    "price_currency" TEXT NOT NULL DEFAULT 'USD',
    "logo_url" TEXT,
    "last_price_update" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_holdings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DECIMAL(16,8) NOT NULL DEFAULT 0,
    "average_cost_basis" DECIMAL(16,6) NOT NULL DEFAULT 0,
    "total_invested" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_transactions" (
    "id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(16,8) NOT NULL,
    "price_per_unit" DECIMAL(16,6) NOT NULL,
    "total_amount" DECIMAL(16,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_price_history" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open_price" DECIMAL(16,6) NOT NULL,
    "close_price" DECIMAL(16,6) NOT NULL,
    "high_price" DECIMAL(16,6) NOT NULL,
    "low_price" DECIMAL(16,6) NOT NULL,
    "volume" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_symbol_idx" ON "assets"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "assets_symbol_exchange_key" ON "assets"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "portfolio_holdings_account_id_idx" ON "portfolio_holdings"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_holdings_account_id_client_id_key" ON "portfolio_holdings"("account_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_holdings_account_id_asset_id_key" ON "portfolio_holdings"("account_id", "asset_id");

-- CreateIndex
CREATE INDEX "investment_transactions_holding_id_date_idx" ON "investment_transactions"("holding_id", "date" DESC);

-- CreateIndex
CREATE INDEX "investment_transactions_account_id_date_idx" ON "investment_transactions"("account_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "investment_transactions_account_id_client_id_key" ON "investment_transactions"("account_id", "client_id");

-- CreateIndex
CREATE INDEX "asset_price_history_asset_id_date_idx" ON "asset_price_history"("asset_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "asset_price_history_asset_id_date_key" ON "asset_price_history"("asset_id", "date");

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "portfolio_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_price_history" ADD CONSTRAINT "asset_price_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
