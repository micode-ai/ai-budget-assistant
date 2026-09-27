-- ABA-617: record who set a category's COICOP division, and re-ask the
-- classifier once about every TOTAL it assigned under the first prompt.
ALTER TABLE "categories" ADD COLUMN "coicop_source" TEXT;

-- Before this column existed nothing recorded the source. Clear every TOTAL
-- so CoicopClassifierService.ensureClassified asks again: a seed icon re-maps
-- itself for free (the gifts icon now to CP09), anything else goes to the
-- model once with the new prompt. A TOTAL a user picked by hand is cleared
-- too — accepted, rare. Non-TOTAL rows keep their division, source NULL.
UPDATE "categories" SET "coicop_division" = NULL
WHERE "coicop_division" = 'TOTAL' AND "coicop_source" IS NULL;
