-- Returnable-packaging deposits (kaucja / Pfand / statiegeld / consigne).
--
-- Stored separately from the category split because the split is only emitted
-- when the receipt's arithmetic reconciles, and it frequently does not. A
-- deposit the app read but could not split must still be visible on the
-- expense — and this column is also the only way to measure how reliably the
-- deposit is extracted at all, which nothing could do while the value was
-- never written down.
ALTER TABLE "expenses" ADD COLUMN "deposit_amount" DECIMAL(12,2);
