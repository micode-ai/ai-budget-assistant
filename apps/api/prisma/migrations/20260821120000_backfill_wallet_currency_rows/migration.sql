-- ABA-431: give every currency an account actually holds money in a
-- `wallet_balances` row, so the wallet stops hiding it.
--
-- The wallet rendered one card per `wallet_balances` row, and that table is
-- written only by the "set balance" screen — so a currency the user never set
-- an initial balance for stayed invisible however much money moved through it.
-- On production this was the normal state, not an edge case: 36 of the ~43
-- account+currency pairs holding money had no row.
--
-- Data-only migration. `initial_amount` is 0 because the balance is derived
-- from the movements; a currency whose row already exists is left alone,
-- INCLUDING a soft-deleted one — that row means the user hid the currency on
-- purpose, and NOT EXISTS (without an is_deleted filter) is what preserves it.

INSERT INTO wallet_balances (
  id, account_id, user_id, client_id, currency_code,
  initial_amount, is_deleted, sync_version, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  missing.account_id,
  attributed.user_id,
  gen_random_uuid()::text,
  missing.currency_code,
  0,
  false,
  0,
  now(),
  now()
FROM (
  SELECT DISTINCT held.account_id, held.currency_code
  FROM (
    -- Mirrors the six money sources WalletService.getSummary aggregates.
    SELECT account_id, currency_code FROM incomes WHERE is_deleted = false
    UNION SELECT account_id, currency_code FROM expenses
      WHERE is_deleted = false AND is_split_receivable = false
    UNION SELECT account_id, from_currency FROM currency_exchanges WHERE is_deleted = false
    UNION SELECT account_id, to_currency FROM currency_exchanges WHERE is_deleted = false
    UNION SELECT from_account_id, from_currency FROM account_transfers WHERE is_deleted = false
    UNION SELECT to_account_id, to_currency FROM account_transfers
      WHERE is_deleted = false AND count_as_income = false
  ) held
  WHERE held.currency_code IS NOT NULL
    AND btrim(held.currency_code) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM wallet_balances w
      WHERE w.account_id = held.account_id
        AND w.currency_code = held.currency_code
    )
) missing
-- A row has to belong to somebody (user_id is NOT NULL): the owner, else any
-- member. Filtered on the role rather than sorted by it — alphabetically
-- 'editor' sorts ahead of 'owner'. CROSS JOIN LATERAL, so an account with no
-- members at all contributes no rows instead of failing the migration.
CROSS JOIN LATERAL (
  SELECT am.user_id
  FROM account_members am
  WHERE am.account_id = missing.account_id
  ORDER BY (am.role = 'owner') DESC, am.joined_at ASC
  LIMIT 1
) attributed;
