-- ABA-140 follow-up: backfill expenses.merchant from OCR-formatted descriptions.
--
-- Scope (high precision, OCR receipts only):
--   source = 'ocr' rows whose description was machine-formatted by ocr.service.ts as
--     "Purchase at <Merchant>"     (no/zero items, merchant known)
--     "<Merchant> (<N> items)"     (multi-item receipt, merchant known)
--   Single-item OCR rows store the item description (not a merchant) and are skipped.
--   "Purchase (N items)" (merchant was unknown) is skipped.
--
-- Only touches rows where merchant IS NULL, not deleted, and description is PLAINTEXT
-- (encrypted_payload IS NULL). E2EE accounts store description as ciphertext in
-- encrypted_payload, so the server cannot recover their merchant — those are skipped.
--
-- Does NOT bump updated_at/sync_version: the mobile sync merge re-upserts every server
-- row and writes merchant unconditionally, so the value propagates on the next full pull
-- (once the merchant-aware mobile build ships).
--
-- Run the DRY RUN first, eyeball the extracted values, then run APPLY in a transaction.

-- ============================================================
-- DRY RUN — read-only. Review the extracted merchant values.
-- ============================================================
WITH candidates AS (
  SELECT
    id,
    description,
    CASE
      WHEN description ~ '^Purchase at .+'
        THEN btrim(substring(description from '^Purchase at (.+)$'))
      ELSE btrim(substring(description from '^(.+) \(\d+ items\)$'))
    END AS extracted_merchant
  FROM expenses
  WHERE source = 'ocr'
    AND merchant IS NULL
    AND is_deleted = false
    AND encrypted_payload IS NULL
    AND description IS NOT NULL
    AND (
      description ~ '^Purchase at .+'
      OR description ~ '^.+ \(\d+ items\)$'
    )
)
SELECT extracted_merchant, count(*) AS rows
FROM candidates
WHERE extracted_merchant IS NOT NULL
  AND extracted_merchant <> ''
  AND extracted_merchant <> 'Purchase'
GROUP BY extracted_merchant
ORDER BY rows DESC, extracted_merchant;

-- ============================================================
-- APPLY — run inside a transaction; verify the UPDATE counts, then COMMIT (or ROLLBACK).
-- ============================================================
BEGIN;

-- Pattern 1: "Purchase at <Merchant>"
UPDATE expenses
SET merchant = btrim(substring(description from '^Purchase at (.+)$'))
WHERE source = 'ocr'
  AND merchant IS NULL
  AND is_deleted = false
  AND encrypted_payload IS NULL
  AND description ~ '^Purchase at .+'
  AND btrim(substring(description from '^Purchase at (.+)$')) <> '';

-- Pattern 2: "<Merchant> (<N> items)"  (skip the "Purchase (N items)" unknown-merchant case)
UPDATE expenses
SET merchant = btrim(substring(description from '^(.+) \(\d+ items\)$'))
WHERE source = 'ocr'
  AND merchant IS NULL
  AND is_deleted = false
  AND encrypted_payload IS NULL
  AND description ~ '^.+ \(\d+ items\)$'
  AND btrim(substring(description from '^(.+) \(\d+ items\)$')) NOT IN ('', 'Purchase');

-- Review the two "UPDATE <n>" counts above. If they look right:
COMMIT;
-- otherwise: ROLLBACK;
