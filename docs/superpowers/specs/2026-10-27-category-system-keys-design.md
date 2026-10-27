# Category system keys — design

Date: 2026-10-27 · Status: draft for approval

## Why

A category's identity is its displayed name today, and the displayed name depends on the language the
category was created in. Every lookup that asks "is this the groceries / the deposit category?"
compares names, so switching the UI language breaks identity:

- the receipt finalizer looked the deposit category up by the owner's current-language name, so each
  language switch minted a new deposit category (one production account had three, one per
  language; stop-gap fix ABA-697 matches deposit names in all nine languages);
- the server seeds a new account's categories in the user's language, while the app seeds its own
  English defaults offline (`categoryStore.ts`, ids `default-exp-*`) and translates only those, by
  matching the English name (`utils/categoryDisplayName.ts`) — two catalogs, joined by name;
- the duplicate check added in ABA-696 recognizes a translation only by comparing names against
  every locale's default list.

The user's requirement: **the language can be switched at any time and nothing may break, be
duplicated or get lost — and nothing may break for existing clients.**

## What success looks like

- A standard category is recognised by a language-independent **system key** (`groceries`,
  `alcohol`, `deposit`, `foodAndDining`, …), never by its name.
- Switching the UI language from English to Polish shows "Groceries" as "Zakupy spożywcze" — the
  display name of a standard category follows the UI language (user decision).
- A standard category the user renamed keeps the user's name in every language (user decision).
  It keeps its system key, so lookups still find it.
- The user's own categories (no key) show exactly the name they typed, in every language.
- Switching language never creates, duplicates, merges or loses a category, and never changes a
  budget figure.

## Goals

1. **Key catalog.** One catalog of standard categories: key, type, icon, colour, and the display
   name in all nine locales (`en de es fr pl ru ua be nl`). It replaces both the API's per-locale
   `default-categories.ts` lists and the app's English seed lists; the app's on-screen translation
   comes from it. Deposit is a catalog entry (`deposit`) that is never seeded up front.
2. **Two new category fields.** `systemKey` (nullable; null = the user's own category) and
   `nameCustomized` (boolean, default false). Display name = `name` when there is no key or
   `nameCustomized` is true; otherwise the catalog name for the current UI language (falling back to
   `name` if the key is unknown to this app version).
3. **Every identity lookup goes by key**, with a name fallback only for rows that have no key yet:
   deposit lookup in the receipt finalizer, the deposit exclusions in the classifier, the
   equivalence check of automatic creation (ABA-696), "standard names" offered to the classifier,
   default-id resolution (`default-exp-*`) in `resolveExpenseCategoryId`, the app's offline-seed
   convergence with server rows.
4. **Automatic creation of a standard concept creates a keyed category.** When an automatic path
   (receipt proposal, import, categorize pass, expense name fallback) would create a category whose
   name is a catalog name in any language, it reuses the account's category with that key, or
   creates one with the key.
5. **Renaming sets `nameCustomized`.** A rename of a keyed category through the app (PATCH with a
   `name`) sets `nameCustomized = true`; the key stays.
6. **Backfill existing data, without merging anything.** A migration assigns keys to existing
   rows: a live category whose name equals a catalog name in any language (case/space-insensitive)
   gets that key; deposit names get `deposit`. If an account has several candidates for one key and
   type, only the oldest gets it — the rest stay keyless (visible duplicates the user or a cleanup
   can merge). `nameCustomized` stays false for backfilled rows. The app's local SQLite gets the same
   two columns and the same backfill for its own rows.

## Non-goals

- Automatic merging of duplicate categories (the backfill only labels; it never moves money).
- Translating the user's own categories.
- A "reset to the standard name" action (follow-up).
- Changing how the AI chat matches a category the user types by name (it keeps matching the
  displayed name the user sees).
- The analytics donut roll-up and anything else from ABA-696's follow-up list.

## Anti-goals

- An existing app version showing a blank, wrong or changed category name, or failing to sync.
- Any budget, analytics or report figure changing because of the backfill or a language switch.
- The backfill merging, deleting or re-pointing a single expense.
- A second category with the same key in one account, created by any path.

## Constraints

- **Old clients are unaware of the new fields.** The server keeps `name` filled for every category
  (for a keyed category: the name it was created with), so an old app shows what it shows today; the
  new fields are additive in API responses and ignored by old apps. Requests from old apps (no
  `systemKey`, renames without the new semantics) must keep working.
- **Schema change lands with its migration in the same commit** (CLAUDE.md, ABA-558), applied by
  `prisma migrate deploy`; the backfill is part of that migration or a guaranteed post-migration
  step — never a manual DB edit.
- `@@unique([accountId, name, type])` stays as is.
- Uniqueness of a key per account and type must be enforced by the database (a partial unique index
  on `(account_id, system_key, type) WHERE system_key IS NOT NULL AND NOT is_deleted`), so no race can
  create a second keyed row.
- The catalog is needed by both the API and the app, and the API may not import runtime values from
  `@budget/shared-utils`: it is a duplicated pair (canonical `apps/api/src/common/utils`, mirror
  `packages/shared-utils`) with a parity test, like `deposit-category.ts`.
- Offline-first: the app's local seeds (`default-exp-*`) get keys; their convergence with server rows
  must match by key first.
- Everything ships phone and desktop web; all nine locales.

## Decided by the user

- A standard category's displayed name follows the UI language.
- A standard category the user renamed keeps the user's name in every language.
- Switching language must never break or lose anything, and nothing may break for existing clients.
- Existing standard categories are translated right away: after the update, every backfilled
  (keyed, not customized) category shows in the UI language, even where that changes the name a
  user sees today (e.g. a category created in Polish under an English UI now reads in English).
  The user accepted this visible change.

## Decided by the designer (check these)

- `nameCustomized` is an explicit flag rather than "name differs from the catalog": a user who
  renames Groceries to another language's standard word (e.g. the Russian one) means a custom name,
  which a comparison would misread as standard.
- The backfill gives the key to the **oldest** live candidate per account and type; the rest stay
  keyless. Rationale: the oldest is the one budgets and rules are most likely built on.
- The key set is the union of the API's current default list and the app's current English seed
  list, plus `deposit`; keys are camelCase English slugs and are permanent once shipped.
- ABA-697's any-language deposit match stays as the fallback for keyless rows.
- **`systemKey` is server-owned.** Clients never send it; the API ignores it in create/update/sync
  payloads. An absent field never clears a key. This makes old and new clients identical on the
  write path and keeps the unique-index race inside the server.
- **Any rename of a keyed category sets `nameCustomized = true` on the server**, whichever client sent
  it — an old app's rename must not flip back to the catalog name on a new app.
- **Creation of a catalog name (explicit or automatic):** if the account already has a live category
  with that key and type, the existing one is returned (no duplicate); otherwise the new row gets the
  key. This also covers an old app creating "Groceries" by hand.
- **Unique-key races** are handled like the existing `@@unique` races in `CategoriesService.create`:
  catch P2002 and re-read the winner. Because only the server assigns keys, no client id ever needs
  remapping because of a key.
- **Offline seeds:** the app labels its own `default-exp-*`/`default-inc-*` seed rows with keys
  locally (display only); on pull, a local seed converges with the server row of the same key and
  type (the existing `mergeCategoryInto` path, matched by key before name).
- **Matching is type-scoped.** A name is looked up only among catalog entries of the same type; a
  parity test asserts no name maps to two keys of one type.
- **Backfill winner:** among several live candidates for one key and type in an account, the one with
  the most expenses (then the oldest) gets the key.
- **Deleted rows** are not keyed by the backfill (a revived row is keyed by the create rule).
- **E2EE accounts** (`encryptionTier >= 1`, where `category.name` is ciphertext on the server) get no
  keys and keep today's name-based behaviour. Keys there would need client-side assignment;
  out of scope.
- **Catalog names** are the names users already have: the API's existing per-locale default lists
  are the source for their entries; entries that exist only in the app's English seed list take the
  app's existing `categories.expense.<key>`/`categories.income.<key>` translations. Where the two
  lists describe the same concept, they become ONE key.
- **The catalog is flat.** Hierarchy (`parentId`, ABA-696) is untouched; `isSystem` keeps its
  current meaning (global and app-seeded rows) and stops driving display, which moves to
  `systemKey`.
- **The server never rewrites `name`** on a language switch; display is computed on the client.
- **Scope of key lookups** is goal 3 plus the creation rule above (which bots and the chat
  `create_category` reach through `CategoriesService.create`); bots and chat otherwise keep matching
  the displayed name.
- **Rollout:** server and migration first, the app later; until users update, old apps keep showing
  stored names, and their offline seeds are keyed on the server through the creation rule.

## Left to the builder

- The catalog's exact file layout and how the app's i18n reads it (catalog-embedded names vs the
  existing `categories.expense.<key>` i18n keys — one source, not two).
- Whether the backfill is SQL inside the migration or a TypeScript step run by `migrator`.
- How the app's SQLite migration and the server pull carry the two fields.
- Tests: display-name rules (key/no key/customized/unknown key), backfill (single, duplicate
  candidates, deposit, deleted rows, custom names untouched), key lookups for deposit and
  equivalence, a race on keyed creation, an old-client request shape.
