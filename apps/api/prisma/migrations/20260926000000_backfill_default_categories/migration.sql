-- ABA-601: backfill the default categories into accounts that never got them.
--
-- ABA-598 made every new non-investment account seed the localized default set,
-- but it was going-forward only: accounts created before it (every account but a
-- user's first) stayed empty or near-empty, and with nothing to choose from the
-- receipt classifiers forced ordinary purchases into whatever unrelated category
-- the account did have.
--
-- Target: active, non-investment accounts holding fewer than 5 of the default
-- names in ANY language (seeded accounts hold 11+; the distribution has a clean
-- gap). Inserted: the owner-language default set (en fallback), skipping every
-- name the account already has - including soft-deleted rows, so a category the
-- user deleted is never resurrected. Idempotent: a re-run finds the names present.
-- Generated from apps/api/src/modules/accounts/default-categories.ts.

WITH defaults(lang, name, icon, color, type) AS (
  VALUES
  ('en', 'Food & Dining', '🍔', '#FF6B6B', 'expense'),
  ('en', 'Groceries', '🛒', '#4ECDC4', 'expense'),
  ('en', 'Alcohol', '🍺', '#D63031', 'expense'),
  ('en', 'Household', '🧴', '#00CEC9', 'expense'),
  ('en', 'Transport', '🚗', '#45B7D1', 'expense'),
  ('en', 'Shopping', '🛍️', '#96CEB4', 'expense'),
  ('en', 'Entertainment', '🎬', '#FFEAA7', 'expense'),
  ('en', 'Bills & Utilities', '💡', '#DFE6E9', 'expense'),
  ('en', 'Health', '💊', '#A29BFE', 'expense'),
  ('en', 'Education', '📚', '#6C5CE7', 'expense'),
  ('en', 'Clothing', '👕', '#FD79A8', 'expense'),
  ('en', 'Gifts', '🎁', '#E17055', 'expense'),
  ('en', 'Travel', '✈️', '#00B894', 'expense'),
  ('en', 'Subscriptions', '📱', '#0984E3', 'expense'),
  ('en', 'Salary', '💰', '#00B894', 'income'),
  ('en', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('en', 'Other', '📦', '#636E72', 'expense'),
  ('ru', 'Еда и рестораны', '🍔', '#FF6B6B', 'expense'),
  ('ru', 'Продукты', '🛒', '#4ECDC4', 'expense'),
  ('ru', 'Алкоголь', '🍺', '#D63031', 'expense'),
  ('ru', 'Бытовая химия', '🧴', '#00CEC9', 'expense'),
  ('ru', 'Транспорт', '🚗', '#45B7D1', 'expense'),
  ('ru', 'Покупки', '🛍️', '#96CEB4', 'expense'),
  ('ru', 'Развлечения', '🎬', '#FFEAA7', 'expense'),
  ('ru', 'Счета и коммунальные', '💡', '#DFE6E9', 'expense'),
  ('ru', 'Здоровье', '💊', '#A29BFE', 'expense'),
  ('ru', 'Образование', '📚', '#6C5CE7', 'expense'),
  ('ru', 'Одежда', '👕', '#FD79A8', 'expense'),
  ('ru', 'Подарки', '🎁', '#E17055', 'expense'),
  ('ru', 'Путешествия', '✈️', '#00B894', 'expense'),
  ('ru', 'Подписки', '📱', '#0984E3', 'expense'),
  ('ru', 'Зарплата', '💰', '#00B894', 'income'),
  ('ru', 'Фриланс', '💻', '#6C5CE7', 'income'),
  ('ru', 'Другое', '📦', '#636E72', 'expense'),
  ('ua', 'Їжа та ресторани', '🍔', '#FF6B6B', 'expense'),
  ('ua', 'Продукти', '🛒', '#4ECDC4', 'expense'),
  ('ua', 'Алкоголь', '🍺', '#D63031', 'expense'),
  ('ua', 'Побутова хімія', '🧴', '#00CEC9', 'expense'),
  ('ua', 'Транспорт', '🚗', '#45B7D1', 'expense'),
  ('ua', 'Покупки', '🛍️', '#96CEB4', 'expense'),
  ('ua', 'Розваги', '🎬', '#FFEAA7', 'expense'),
  ('ua', 'Рахунки та комунальні', '💡', '#DFE6E9', 'expense'),
  ('ua', 'Освіта', '📚', '#6C5CE7', 'expense'),
  ('ua', 'Одяг', '👕', '#FD79A8', 'expense'),
  ('ua', 'Подарунки', '🎁', '#E17055', 'expense'),
  ('ua', 'Подорожі', '✈️', '#00B894', 'expense'),
  ('ua', 'Підписки', '📱', '#0984E3', 'expense'),
  ('ua', 'Зарплата', '💰', '#00B894', 'income'),
  ('ua', 'Фріланс', '💻', '#6C5CE7', 'income'),
  ('ua', 'Інше', '📦', '#636E72', 'expense'),
  ('pl', 'Jedzenie i restauracje', '🍔', '#FF6B6B', 'expense'),
  ('pl', 'Zakupy spożywcze', '🛒', '#4ECDC4', 'expense'),
  ('pl', 'Alkohol', '🍺', '#D63031', 'expense'),
  ('pl', 'Chemia domowa', '🧴', '#00CEC9', 'expense'),
  ('pl', 'Transport', '🚗', '#45B7D1', 'expense'),
  ('pl', 'Zakupy', '🛍️', '#96CEB4', 'expense'),
  ('pl', 'Rozrywka', '🎬', '#FFEAA7', 'expense'),
  ('pl', 'Rachunki', '💡', '#DFE6E9', 'expense'),
  ('pl', 'Zdrowie', '💊', '#A29BFE', 'expense'),
  ('pl', 'Edukacja', '📚', '#6C5CE7', 'expense'),
  ('pl', 'Ubrania', '👕', '#FD79A8', 'expense'),
  ('pl', 'Prezenty', '🎁', '#E17055', 'expense'),
  ('pl', 'Podróże', '✈️', '#00B894', 'expense'),
  ('pl', 'Subskrypcje', '📱', '#0984E3', 'expense'),
  ('pl', 'Wynagrodzenie', '💰', '#00B894', 'income'),
  ('pl', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('pl', 'Inne', '📦', '#636E72', 'expense'),
  ('de', 'Essen & Restaurants', '🍔', '#FF6B6B', 'expense'),
  ('de', 'Lebensmittel', '🛒', '#4ECDC4', 'expense'),
  ('de', 'Alkohol', '🍺', '#D63031', 'expense'),
  ('de', 'Haushalt', '🧴', '#00CEC9', 'expense'),
  ('de', 'Transport', '🚗', '#45B7D1', 'expense'),
  ('de', 'Einkaufen', '🛍️', '#96CEB4', 'expense'),
  ('de', 'Unterhaltung', '🎬', '#FFEAA7', 'expense'),
  ('de', 'Rechnungen', '💡', '#DFE6E9', 'expense'),
  ('de', 'Gesundheit', '💊', '#A29BFE', 'expense'),
  ('de', 'Bildung', '📚', '#6C5CE7', 'expense'),
  ('de', 'Kleidung', '👕', '#FD79A8', 'expense'),
  ('de', 'Geschenke', '🎁', '#E17055', 'expense'),
  ('de', 'Reisen', '✈️', '#00B894', 'expense'),
  ('de', 'Abonnements', '📱', '#0984E3', 'expense'),
  ('de', 'Gehalt', '💰', '#00B894', 'income'),
  ('de', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('de', 'Sonstiges', '📦', '#636E72', 'expense'),
  ('es', 'Comida y restaurantes', '🍔', '#FF6B6B', 'expense'),
  ('es', 'Supermercado', '🛒', '#4ECDC4', 'expense'),
  ('es', 'Alcohol', '🍺', '#D63031', 'expense'),
  ('es', 'Hogar', '🧴', '#00CEC9', 'expense'),
  ('es', 'Transporte', '🚗', '#45B7D1', 'expense'),
  ('es', 'Compras', '🛍️', '#96CEB4', 'expense'),
  ('es', 'Entretenimiento', '🎬', '#FFEAA7', 'expense'),
  ('es', 'Facturas', '💡', '#DFE6E9', 'expense'),
  ('es', 'Salud', '💊', '#A29BFE', 'expense'),
  ('es', 'Educación', '📚', '#6C5CE7', 'expense'),
  ('es', 'Ropa', '👕', '#FD79A8', 'expense'),
  ('es', 'Regalos', '🎁', '#E17055', 'expense'),
  ('es', 'Viajes', '✈️', '#00B894', 'expense'),
  ('es', 'Suscripciones', '📱', '#0984E3', 'expense'),
  ('es', 'Salario', '💰', '#00B894', 'income'),
  ('es', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('es', 'Otros', '📦', '#636E72', 'expense'),
  ('fr', 'Repas et restaurants', '🍔', '#FF6B6B', 'expense'),
  ('fr', 'Courses', '🛒', '#4ECDC4', 'expense'),
  ('fr', 'Alcool', '🍺', '#D63031', 'expense'),
  ('fr', 'Maison', '🧴', '#00CEC9', 'expense'),
  ('fr', 'Transport', '🚗', '#45B7D1', 'expense'),
  ('fr', 'Shopping', '🛍️', '#96CEB4', 'expense'),
  ('fr', 'Divertissement', '🎬', '#FFEAA7', 'expense'),
  ('fr', 'Factures', '💡', '#DFE6E9', 'expense'),
  ('fr', 'Santé', '💊', '#A29BFE', 'expense'),
  ('fr', 'Éducation', '📚', '#6C5CE7', 'expense'),
  ('fr', 'Vêtements', '👕', '#FD79A8', 'expense'),
  ('fr', 'Cadeaux', '🎁', '#E17055', 'expense'),
  ('fr', 'Voyages', '✈️', '#00B894', 'expense'),
  ('fr', 'Abonnements', '📱', '#0984E3', 'expense'),
  ('fr', 'Salaire', '💰', '#00B894', 'income'),
  ('fr', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('fr', 'Autres', '📦', '#636E72', 'expense'),
  ('be', 'Ежа і рэстараны', '🍔', '#FF6B6B', 'expense'),
  ('be', 'Прадукты', '🛒', '#4ECDC4', 'expense'),
  ('be', 'Алкаголь', '🍺', '#D63031', 'expense'),
  ('be', 'Бытавая хімія', '🧴', '#00CEC9', 'expense'),
  ('be', 'Транспарт', '🚗', '#45B7D1', 'expense'),
  ('be', 'Пакупкі', '🛍️', '#96CEB4', 'expense'),
  ('be', 'Забавы', '🎬', '#FFEAA7', 'expense'),
  ('be', 'Рахункі і камунальныя', '💡', '#DFE6E9', 'expense'),
  ('be', 'Адукацыя', '📚', '#6C5CE7', 'expense'),
  ('be', 'Адзенне', '👕', '#FD79A8', 'expense'),
  ('be', 'Падарункі', '🎁', '#E17055', 'expense'),
  ('be', 'Падарожжы', '✈️', '#00B894', 'expense'),
  ('be', 'Падпіскі', '📱', '#0984E3', 'expense'),
  ('be', 'Зарплата', '💰', '#00B894', 'income'),
  ('be', 'Фрыланс', '💻', '#6C5CE7', 'income'),
  ('be', 'Іншае', '📦', '#636E72', 'expense'),
  ('nl', 'Eten & restaurants', '🍔', '#FF6B6B', 'expense'),
  ('nl', 'Boodschappen', '🛒', '#4ECDC4', 'expense'),
  ('nl', 'Alcohol', '🍺', '#D63031', 'expense'),
  ('nl', 'Huishouden', '🧴', '#00CEC9', 'expense'),
  ('nl', 'Vervoer', '🚗', '#45B7D1', 'expense'),
  ('nl', 'Winkelen', '🛍️', '#96CEB4', 'expense'),
  ('nl', 'Entertainment', '🎬', '#FFEAA7', 'expense'),
  ('nl', 'Rekeningen', '💡', '#DFE6E9', 'expense'),
  ('nl', 'Gezondheid', '💊', '#A29BFE', 'expense'),
  ('nl', 'Onderwijs', '📚', '#6C5CE7', 'expense'),
  ('nl', 'Kleding', '👕', '#FD79A8', 'expense'),
  ('nl', 'Cadeaus', '🎁', '#E17055', 'expense'),
  ('nl', 'Reizen', '✈️', '#00B894', 'expense'),
  ('nl', 'Abonnementen', '📱', '#0984E3', 'expense'),
  ('nl', 'Salaris', '💰', '#00B894', 'income'),
  ('nl', 'Freelance', '💻', '#6C5CE7', 'income'),
  ('nl', 'Overig', '📦', '#636E72', 'expense')
),
target AS (
  SELECT a.id AS account_id,
         COALESCE(
           (SELECT u.language FROM account_members m JOIN users u ON u.id = m.user_id
             WHERE m.account_id = a.id AND m.role = 'owner' LIMIT 1),
           'en') AS owner_lang
  FROM accounts a
  WHERE a.is_active = true
    AND a.type <> 'investment'
    AND (SELECT COUNT(DISTINCT lower(c.name)) FROM categories c
          WHERE c.account_id = a.id
            AND lower(c.name) IN (SELECT lower(d.name) FROM defaults d)) < 5
),
resolved AS (
  SELECT t.account_id,
         CASE WHEN EXISTS (SELECT 1 FROM defaults d WHERE d.lang = t.owner_lang)
              THEN t.owner_lang ELSE 'en' END AS lang
  FROM target t
)
INSERT INTO categories (id, account_id, name, icon, color, type, created_at, updated_at)
SELECT gen_random_uuid()::text, r.account_id, d.name, d.icon, d.color, d.type, NOW(), NOW()
FROM resolved r
JOIN defaults d ON d.lang = r.lang
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.account_id = r.account_id AND lower(c.name) = lower(d.name)
);
