# Category system keys

*Hub: [api](../api.md) · [mobile-app](../mobile-app.md) · related:
[category-hierarchy](category-hierarchy.md), [receipt-category-split](receipt-category-split.md)*

## What this is

A standard category (groceries, alcohol, deposit, ...) is recognised by a language-independent
**system key** stored on the row, never by its name. The name of a standard category follows the UI
language on screen; a standard category the user renamed keeps the user's name in every language;
the user's own categories (no key) always show the name they typed.

Why it exists: a category's identity used to be its displayed name, and the name depended on the
language it was created in. Every "is this the groceries / deposit category?" lookup compared names,
so a UI language switch broke identity. One production account ended up with three deposit
categories, one per language, and the server's seeded defaults (in the owner's language) and the
app's offline English seeds were two catalogs joined only by name. Design:
`docs/superpowers/specs/2026-10-27-category-system-keys-design.md`.

## Entry points

- Catalog (duplicated pair, parity test in mobile):
  `apps/api/src/common/utils/category-catalog.ts` · mirror
  `packages/shared-utils/src/formatting/category-catalog.ts` — key, type, icon, colour, seeded flag
  and the name in all nine locales, plus legacy aliases (names older app builds wrote)
- `apps/api/src/common/utils/category-key.util.ts` — `matchKeyedCategory` (create rule, key first),
  `matchExistingCategory` (resolve rule, exact name first), `findKeyedCategory`, `createOrReuseKeyed`
- `apps/api/src/modules/categories/categories.service.ts` — server-owned key, rename and type rules
- Schema: `apps/api/prisma/schema.prisma` (`Category.systemKey`, `nameCustomized`) and migration
  `apps/api/prisma/migrations/20261027000000_category_system_keys/`
- Index guard: `apps/api/src/common/utils/category-system-key-index-guard.spec.ts`
- Seeding: `apps/api/src/modules/accounts/` (`default-categories.ts`); resolver
  `expense-category-resolver.util.ts`; `import-bank-category.util.ts`; `categorize-bot.service.ts`
- Receipts: `receipt-category-split.service.ts`, `apps/api/src/common/utils/receipt-category-split.ts`
- App display: `apps/mobile/src/utils/categoryDisplayName.ts`, `entityLabel.ts`
- App store: `apps/mobile/src/stores/categoryStore.ts`, `apps/mobile/src/db/categoryRepository.ts`

## Key concepts

**Display rule (`displayCategoryName`).** A keyed row not marked `nameCustomized` shows the catalog
name for the UI language; a customized keyed row shows `name`; a key this app version does not know
shows `name`; a keyless row shows `name`, with one legacy exception: a keyless `isSystem` row whose
stored name is a catalog name keeps translating through the old English-name map (global system
categories, unlabelled seeds, E2EE seeds). The server never rewrites `name` on a language switch;
display is computed on the client, and `name` stays filled for every row so old app builds show what
they always showed.

**The key is server-owned.** Create and update bodies may carry `systemKey` / `nameCustomized`;
the API accepts and ignores them, and an absent field never clears a key. Creating a category whose
name is a catalog name (any language, same type) returns the account's live category with that key
if there is one, else creates the row with the key — so an old app creating "Groceries" by hand
cannot make a second one. A rename of a keyed row whose name actually changed sets `nameCustomized`,
whichever client sent it. A type switch clears the key and the flag. A live keyed row wins over an
exact-name match and over soft-deleted rows.

**Creating vs resolving.** Two match orders, chosen per caller. *Creating* (or deciding whether a
proposed name is new: `CategoriesService.create`, `createOrReuseKeyed`, the receipt and categorize
equivalence check) is key first, so no second row of a concept is made. *Resolving a reference to a
category the account already has* (an expense or income name / `fallbackName` in
`resolveExpenseCategoryId`, an import row in `preloadCategories`) is **exact normalized live name
first**, then the key rule. The backfill leaves keyless duplicates beside a keyed row (keyed
"Zakupy spożywcze" + keyless "Groceries"); key first there would re-route references that always
landed on "Groceries" to the keyed row and move spend. A `default-exp-<slug>` / `default-inc-<slug>`
id likewise prefers a live row named exactly as the seed name (or alias) the slug came from, then
the key holder. The app's key convergence skips a seed that has an exact-name twin among the live
server rows, leaving it to the legacy name convergence.

**Database uniqueness.** A partial unique index
`categories_account_system_key_type_live_key` on `(account_id, system_key, type)` where the key is
not null and the row is not deleted. Prisma cannot model it, so the migration SQL is its only
definition. A P2002 on a keyed create means a concurrent request won: re-read and return the winner.

**Backfill (one shot, in the migration).** Live rows of non-E2EE accounts whose name is a catalog
name in any locale or a legacy alias, matched within the same type, get the key. When several rows
of one account and type claim a key, the one with the most live expenses wins, then the oldest; the
rest stay keyless (visible duplicates for the user to merge). `name` and `nameCustomized` are never
touched, nothing is merged or moved, deleted rows are skipped, and `updated_at` is bumped so sync
delivers the key to devices.

**E2EE accounts are excluded.** At `encryptionTier >= 1` the stored name is ciphertext, so no keys
are assigned and name-based behaviour stays.

**Receipts.** The deposit category is found by key first, then by a name in any language (ABA-697
fallback for keyless rows), and is excluded from the receipt's overall category by id. The
classifier's "standard names" exclude keys the account already holds; a `default-exp-<slug>` id
resolves to its key.

**App side.** Seeds keep frozen ids (`default-exp-*`) and are labelled with keys locally. The name
is sent to the server only when the user changed the prefilled text. A seed skipped because the
server already delivered its key, or merged into the server row, leaves a tombstone, so a deleted standard category never comes back. On first pull a local
seed converges with the server row of the same key and type (matched by key before name), and a
`languageChanged` event hands the store a new array so labels re-render.

## Invariants

- **Never identify a standard category by its name.** Look up by `systemKey`; fall back to a name
  only for rows with no key, and match it in every language.
- **At most one live row per account, key and type** — enforced by the partial index, not by code.
- **`systemKey` is never read from a request body.** Only the server assigns it.
- **A later `prisma migrate dev` will propose dropping the raw index.** Remove that line from the
  generated migration; the guard spec fails if any later migration drops it.
- **The two catalog files are a duplicated pair** — change both, and the API may not import
  `@budget/shared-utils` at runtime. Keys are permanent once shipped; a name must not map to two keys
  of one type (parity test).
- **Nothing under `apps/api/src` may import from `apps/api/scripts/`, specs included.** `nest build`
  compiles specs too, so one such import widens the root and moves `dist/main.js` to
  `dist/src/main.js`; the container then cannot start (the first ABA-698 deploy went down this way).
  The backfill builder therefore lives in `src/common/utils/category-key-backfill.ts`.
- **The backfill labels, it never merges.** No expense, budget or rule is re-pointed by it.
- **Key work never moves money.** When resolving an existing reference, an exact live name beats the
  key; only creation is key first.
- **`name` stays filled and untranslated on the server** so old clients keep working.
- **Display goes through `displayCategoryName` / `entityLabel`**, not through `category.name`, in
  every new app surface.

## Known gaps

- Server-generated text still shows the stored `name`: push notifications, bot replies, chat
  answers, report files, and budget breakdown names built on the server.
- Lists are sorted by the stored name, not the displayed one.
- No "reset to the standard name" action after a rename.
- E2EE accounts keep name-based behaviour.
- Keyless `isSystem` rows keep translating via the legacy English-name map instead of a key.
- Existing duplicates are only labelled, not merged; there is no in-app merge.
- An old (pre-keys) app creating a standard name in another language than the account's (e.g.
  "Groceries" where the keyed row is in Polish) gets the existing keyed row back; its local id remap
  fails on the primary key and leaves a phantom local-only, empty row. No money is lost: the
  expenses arrive on the server under the keyed row through `fallbackName`.
- After renaming a keyed category, creating its standard name returns the renamed row.
- Retyping exactly the stored name does not pin it: `nameCustomized` stays false.
- Server-originated text (bots, push, chat context, PDF / e-mail reports) shows the stored name, not
  the UI language.
- Accounts created at signup are keyed before any later E2EE opt-in and keep those keys (harmless).
- Accounts created in the seconds between `migrate` and the API recreate got keyless seeds; the name
  fallbacks cover them.

## History

[ABA-698](https://github.com/micode-ai/ai-budget-assistant/issues/731) — the feature · 2026-10-27 design spec.
