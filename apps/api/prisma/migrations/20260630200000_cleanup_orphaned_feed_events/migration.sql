-- One-time cleanup: remove family_feed_events for purchase requests
-- that no longer exist in the purchase_requests table (hard-deleted).
-- entityId is a plain text column (no FK), so orphans accumulate silently.
DELETE FROM "family_feed_events"
WHERE "type" LIKE 'PURCHASE_REQUEST_%'
  AND "entity_id" NOT IN (SELECT "id" FROM "purchase_requests");
