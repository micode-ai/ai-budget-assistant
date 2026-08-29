-- Data-only: drop learned rules that file an ordinary product under the
-- returnable-packaging deposit category.
--
-- The deposit feature creates a real category ("Kaucja", "Pfand", ...) on the
-- first receipt that prints a deposit. From then on it sat in the account's
-- category list like any other, so the line classifier offered it to the model:
-- on 2026-08-29 a Lidl receipt filed cured ham, bacon and peanuts under
-- "Kaucja". The save-time learner then wrote those three as permanent rules, so
-- every later receipt containing those products would have been filed there
-- deterministically, with no model call and nothing to notice it.
--
-- The classifier now refuses to resolve a line to a deposit category at all, so
-- these rows are already inert; this deletes them so the data matches the code
-- rather than relying on a read-side guard forever.
--
-- Matched by NAME across all nine locales, not by the owner's current language:
-- a "Pfand" created before the owner switched to Polish is still a deposit
-- category. Safe to delete either way — this table is a cache, rewritten by
-- ExpensesService.create on every saved receipt.
DELETE FROM "product_category_rules" r
USING "categories" c
WHERE r."category_id" = c."id"
  AND lower(btrim(c."name")) IN (
    'deposit',
    'kaucja',
    'pfand',
    'depósito',
    'consigne',
    'statiegeld',
    'залог за тару',
    'застава за тару',
    'закладзь за тару'
  );
