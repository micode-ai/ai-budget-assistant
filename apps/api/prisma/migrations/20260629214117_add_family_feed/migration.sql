-- CreateEnum
CREATE TYPE "FeedEventType" AS ENUM ('EXPENSE_ADDED', 'INCOME_ADDED', 'PURCHASE_REQUEST_CREATED', 'PURCHASE_REQUEST_APPROVED', 'PURCHASE_REQUEST_PURCHASED');

-- CreateTable
CREATE TABLE "family_feed_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "FeedEventType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_feed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_reactions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_feed_events_account_id_created_at_idx" ON "family_feed_events"("account_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "feed_reactions_event_id_user_id_key" ON "feed_reactions"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "family_feed_events" ADD CONSTRAINT "family_feed_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_feed_events" ADD CONSTRAINT "family_feed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "family_feed_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
