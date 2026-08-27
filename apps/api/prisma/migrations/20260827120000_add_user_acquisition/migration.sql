-- ABA-436: record where a signup came from.
--
-- GA4 knows a visitor clicked the hero CTA on /fr/; the API knows someone registered
-- and later logged a first transaction. Nothing joined the two, so "which language and
-- which section actually produce paying users" was unanswerable even though both halves
-- were already measured.
--
-- Flat columns rather than one Json blob: the admin groups by these and Prisma cannot
-- groupBy on Json. All four are nullable and stay NULL for every existing user, every
-- native install, and anyone who arrives without CTA params — that is a legitimate
-- "unknown" and must not be backfilled with a guess.
--
-- The values are a closed vocabulary emitted by the marketing generators (app_url() in
-- build_landing.py / build_blog.py) and re-validated against an allow-list in the API,
-- so no constraint is enforced here.

ALTER TABLE "users" ADD COLUMN "acquisition_source" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_location" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_language" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_plan" TEXT;

CREATE INDEX "users_acquisition_source_idx" ON "users"("acquisition_source");
