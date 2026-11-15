-- ABA-776: link an expense booked by a subscription renewal to that subscription.
ALTER TABLE "expenses" ADD COLUMN "user_subscription_id" TEXT;
