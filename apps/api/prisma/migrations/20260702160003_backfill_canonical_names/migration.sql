-- Backfill canonical_name for existing expense_items from OCR scans.
-- Uses the same fallback logic as buildCanonicalNameFallback() in ocr.service.ts:
-- take the first whitespace-delimited token that is >= 3 chars and not a purely
-- numeric/unit token (e.g. "3.49", "500G", "1L", "3,2%").
UPDATE expense_items ei
SET canonical_name = lat.first_token
FROM expense_items src
CROSS JOIN LATERAL (
  SELECT token AS first_token
  FROM REGEXP_SPLIT_TO_TABLE(TRIM(src.description), '\s+') AS t(token)
  WHERE LENGTH(token) >= 3
    AND NOT token ~ '^\d+([.,]\d+)?%?[GLKgmMlL]*$'
  LIMIT 1
) lat
WHERE ei.id = src.id
  AND src.canonical_name IS NULL
  AND src.description IS NOT NULL
  AND TRIM(src.description) <> '';
