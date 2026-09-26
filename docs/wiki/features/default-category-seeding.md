# Default category seeding on account creation

*Hub: [api](../api.md)*

## What this is

Every new account — not just a user's very first, auto-created `personal` account — gets seeded
with the same localized default category set (Groceries, Transport, Rent, ...) at creation time.
Previously only `AccountsService.createDefaultAccount()` (called once, at registration) seeded
categories; `AccountsService.create()` (every account a user creates afterward — a second
`personal` account, a `shared` family account, a `business` account, a `trip` wallet) left the new
account with zero categories. That gap is exactly what made the categorize-uncategorized pass
(ABA-589) necessary for receipt scans on a second account, and was flagged as out of scope on that
feature's own page. It's closed now, for account creation only — see **Known gaps** below.

## Entry points

- `apps/api/src/modules/accounts/accounts.service.ts` — `AccountsService.create()` (the change),
  `AccountsService.createDefaultAccount()` (refactored to share the same helper, behavior
  unchanged), private `seedDefaultCategoriesForAccount(tx, accountId, language)`
- `apps/api/src/modules/accounts/default-categories.ts` — `getDefaultCategories(language)`, the
  9-locale lookup table (unchanged)
- `apps/api/src/modules/accounts/accounts.controller.ts` — `POST /accounts` is the one route that
  reaches `create()`

## Invariants

- **Salary and Freelance are seeded as `income`.** `DefaultCategory.type` marks them in every language; the seeder writes it. Before [ABA-600](https://github.com/micode-ai/ai-budget-assistant/issues/624) all 17 defaults were `expense`, so a new account had no income category and the income review had to invent one. Existing accounts were backfilled once by ABA-601 (see **Known gaps**).


- **Seeding happens inside the same `$transaction` as the account + owner-membership create.** A
  category set that lands after the account's create-response has already gone out would race the
  client's first `GET /categories` for that account.
- **`investment` accounts are never seeded.** They're portfolio-holdings-centric
  (`InvestmentHolding`/`PortfolioHolding`), not expense-category-centric — a Groceries/Alcohol/
  Household set doesn't fit one. `personal`, `business`, `shared`, `trip` all get the full set —
  a `trip` account tracks expenses the same way any account does, so there is no separate
  "travel-relevant subset" list to maintain.
- **The seed language is the creating user's `user.language`**, read at `create()`-time via
  `tx.user.findUnique`, with the same `?? 'en'` fallback `getDefaultCategories` already applies to
  an unknown/missing language. For the shared-account invite flow this is a non-issue: the account
  is created once, by its owner, before any invitee joins — `acceptInvitation`/
  `respondToInvitation` only create a membership on an *already-seeded* account, they never create
  a second account or a second seed pass. There's no "whose language wins" case.

## Known gaps

- **Backfilled once, not continuously (ABA-601).** Migration
  `20260926000000_backfill_default_categories` seeded the owner-language set into every active,
  non-investment account holding fewer than 5 default names in any language (seeded accounts hold
  11+, so the gap is clean). It skips every name the account already has, **including soft-deleted
  rows** — a category the user deleted is never resurrected — and it is idempotent. Why it was
  needed: an account with no groceries category made the receipt classifiers force food into
  whatever unrelated category it did have. The SQL is generated from `default-categories.ts`; a
  later change to the default set does not reach it.
- **No empty-state banner** on the categories settings screen nudging a user toward the categorize
  pass or a manual seed for an account that predates this change.
