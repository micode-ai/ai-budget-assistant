-- Play Install Referrer evidence (ABA-553). Additive, nullable, no backfill:
-- an install referrer is delivered once to the device and cannot be recovered
-- for users who registered before this shipped, so NULL is the honest value.
ALTER TABLE "users" ADD COLUMN "acquisition_referrer_raw" TEXT;
