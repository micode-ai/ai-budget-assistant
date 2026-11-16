-- ABA-788: link renewals booked before ABA-776 to their subscription.
-- The renewal cron books an expense with the subscription's name, amount and
-- currency, source 'manual', after the subscription exists. Link an unlinked
-- live expense only when exactly ONE subscription of its account matches all
-- of that; an ambiguous match is left alone. Idempotent: linked rows are skipped.
-- updated_at is bumped so devices, which pull by updated_at, receive the link.
UPDATE "expenses" e
SET "user_subscription_id" = m.sub_id,
    "updated_at" = now()
FROM (
  SELECT e2.id AS expense_id, min(s.id) AS sub_id
  FROM "expenses" e2
  JOIN "user_subscriptions" s
    ON s.account_id = e2.account_id
   AND s.name = e2.description
   AND s.amount = e2.amount
   AND s.currency_code = e2.currency_code
   AND e2.created_at >= s.created_at
  WHERE e2.user_subscription_id IS NULL
    AND e2.is_deleted = false
    AND e2.source = 'manual'
  GROUP BY e2.id
  HAVING count(s.id) = 1
) m
WHERE e.id = m.expense_id;
