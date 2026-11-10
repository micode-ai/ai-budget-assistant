#!/usr/bin/env bash
# Weekly growth digest (ABA-740). Runs ON THE VPS, piped over SSH by
# .github/workflows/growth-digest.yml (`ssh … 'bash -s' < scripts/growth-digest.sh`),
# the same way infra-check.sh runs. Prints a short plain-text report on stdout.
#
# Read-only: SELECTs only, inside a READ ONLY transaction.
# Internal accounts (ADMIN_EMAILS from the env file) are left out of every figure,
# the same rule as the admin Activation and Telemetry pages; an unset list excludes nobody.
#
# Env (all optional):
#   PG_CONTAINER (budget-db-prod), PG_USER (postgres), PG_DB (ai_budget)
#   ENV_FILE     (/opt/ai-budget/.env.production)
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-budget-db-prod}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-ai_budget}"
ENV_FILE="${ENV_FILE:-/opt/ai-budget/.env.production}"

INTERNAL=""
if [ -r "$ENV_FILE" ]; then
  # Value only, quotes and spaces stripped, lower-cased; never echoed — it is a list of addresses.
  INTERNAL=$(grep -E '^ADMIN_EMAILS=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"' " | tr '[:upper:]' '[:lower:]')
fi

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q -At \
  -v internal="$INTERNAL" <<'SQL'
BEGIN TRANSACTION READ ONLY;

SELECT '== Signups (last 7 days | previous 7) ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ','))))
SELECT count(*) FILTER (WHERE created_at >= now() - interval '7 days') || ' | ' ||
       count(*) FILTER (WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days')
FROM real_users;

SELECT '== Signups by source, last 7 days ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ','))))
SELECT coalesce(acquisition_source, '(none)') || ': ' || count(*)
FROM real_users WHERE created_at >= now() - interval '7 days'
GROUP BY coalesce(acquisition_source, '(none)') ORDER BY count(*) DESC, 1;

SELECT '== Activation, cohort that signed up 8-14 days ago ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ',')))),
first_tx AS (
  SELECT user_id, min(created_at) AS at FROM (
    SELECT user_id, created_at FROM expenses WHERE NOT is_deleted
    UNION ALL
    SELECT user_id, created_at FROM incomes WHERE NOT is_deleted
  ) t GROUP BY user_id)
SELECT 'signups ' || count(*)
    || ' | in 24h ' || count(*) FILTER (WHERE f.at < u.created_at + interval '1 day')
    || ' | in 7d '  || count(*) FILTER (WHERE f.at < u.created_at + interval '7 days')
    || ' | rate 7d ' || coalesce(round(100.0 * count(*) FILTER (WHERE f.at < u.created_at + interval '7 days') / nullif(count(*), 0)) || '%', '-')
FROM real_users u LEFT JOIN first_tx f ON f.user_id = u.id
WHERE u.created_at >= now() - interval '14 days' AND u.created_at < now() - interval '7 days';

SELECT '== Active users (last activity in 7 days | previous 7) ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ','))))
SELECT count(*) FILTER (WHERE last_sync_at >= now() - interval '7 days') || ' | ' ||
       count(*) FILTER (WHERE last_sync_at >= now() - interval '14 days' AND last_sync_at < now() - interval '7 days')
FROM real_users;

SELECT '== Transactions logged (last 7 days | previous 7) ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ','))))
SELECT count(*) FILTER (WHERE t.created_at >= now() - interval '7 days') || ' | ' ||
       count(*) FILTER (WHERE t.created_at < now() - interval '7 days')
FROM (
  SELECT user_id, created_at FROM expenses WHERE NOT is_deleted AND created_at >= now() - interval '14 days'
  UNION ALL
  SELECT user_id, created_at FROM incomes WHERE NOT is_deleted AND created_at >= now() - interval '14 days'
) t JOIN real_users u ON u.id = t.user_id;

SELECT '== Onboarding e-mail opt-outs (total) ==';
WITH real_users AS (SELECT * FROM users WHERE NOT (lower(email) = ANY (string_to_array(:'internal', ','))))
SELECT count(*) FROM real_users WHERE NOT onboarding_emails_enabled;

COMMIT;
SQL
