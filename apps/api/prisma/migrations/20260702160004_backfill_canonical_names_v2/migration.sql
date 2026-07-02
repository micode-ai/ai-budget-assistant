-- Re-backfill canonical_name with improved 3-token logic.
-- v1 (20260702160003) only took the first meaningful token → "JOGURT", "CHLEB", "PIWO".
-- v2 takes up to 3 meaningful tokens → "JOGURT ACTIVIA TRUSKAWKOWY", "CHLEB RAZOWY WIEJSKI".
-- Only updates rows where canonical_name is NULL or a single word (no space) —
-- multi-word LLM-generated names and user-set aliases (stored in product_aliases) are preserved.
UPDATE expense_items ei
SET canonical_name = lat.canonical_name
FROM expense_items src
CROSS JOIN LATERAL (
  SELECT STRING_AGG(token, ' ') AS canonical_name
  FROM (
    SELECT token
    FROM REGEXP_SPLIT_TO_TABLE(TRIM(src.description), '\s+') AS t(token)
    WHERE LENGTH(token) >= 3
      AND NOT token ~ '^\d+([.,]\d+)?%?[GLKgmMlL]*$'
    LIMIT 3
  ) tokens
) lat
WHERE ei.id = src.id
  AND src.description IS NOT NULL
  AND TRIM(src.description) <> ''
  AND lat.canonical_name IS NOT NULL
  AND (src.canonical_name IS NULL OR src.canonical_name NOT LIKE '% %');
