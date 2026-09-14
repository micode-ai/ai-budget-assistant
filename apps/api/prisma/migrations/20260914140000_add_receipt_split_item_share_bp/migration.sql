-- ABA-550: explicit per-line split shares, in basis points (6000 = 60%),
-- keyed by expense_item id.
--
-- Additive and nullable on purpose. It sits beside item_ids rather than
-- reshaping it: item_ids is read as a flat array of strings in eight places in
-- the guest controller, by the dispute-flag clamping and by ABA-546's in-place
-- reassignment, and every split that already exists carries one. NULL here --
-- and any line missing from the map -- keeps the original meaning, "divide this
-- line equally among whoever claimed it", so no backfill is needed or wanted.
ALTER TABLE "receipt_split_participants" ADD COLUMN "item_share_bp" JSONB;
