# Child costs ("Ile kosztuje dziecko") — design

Status: draft written without an interview (owner asked to skip questions) · 2026-11-11.
Every decision below not stated by the owner is marked *(my call)*.

## Intent

Parents want to know how much their child actually costs: as a number they can be surprised by and
share ("800+ covered 37% of what Zosia cost this year"), and — for separated parents — as evidence.
A Polish court deciding alimony looks at a child's "usprawiedliwione potrzeby", and today the
parent's evidence is a box of receipts. The app already holds the expenses, the receipt images and
the receipt lines; what it lacks is a way to say *which child* a purchase was for.

## Goals

- A parent can name each child once and attribute spending to them: a whole expense, or individual
  lines of a scanned receipt (diapers in a grocery trip).
- A "Child costs" screen per child: this month, this year, average per month, by category, and a
  monthly trend — on phone and desktop web.
- The 800+ benefit (Rodzina 800 plus) is recognised among incomes, and the screen shows how much of
  the child's spending it covered. A shareable story card states that percentage.
- A Pro **expense statement PDF** for a chosen child and period: totals by category and month, every
  attributed line with date, merchant and amount, and the stored receipt images as an appendix —
  worded as a "zestawienie wydatków", never as a legal document.
- Attribution is fast: the app remembers "this product → this child" and suggests it next time.

## Non-goals

- Legal advice, alimony calculators, court-form generation. *(my call)*
- Splitting costs with the other parent (50/50 ledger). That fits shared groups and is a later
  feature. *(my call)*
- Tax deductions for children (ulga na dziecko) — covered by the separate PIT deductions spec.
- Children's own allowance or pocket-money tracking.
- Any model call. Attribution, suggestion and the 800+ detection are deterministic. *(my call)*

## Anti-goals

- Storing more about a minor than needed: a first name or nickname and an optional colour — no
  birth date, no surname, no photo, no school. *(my call)*
- Copy that tells a parent their child "costs too much" or compares children with each other.
- A PDF that looks like an official or court document (no court headers, no "certified").

## Model

- **`Child`** (account-scoped): `id`, `accountId`, `clientId`, `name` (max 40), `color`,
  `archivedAt`, timestamps. Shared and family accounts naturally share their children. Offline-first
  like tags: created on the device with `clientId`, idempotent create on `(accountId, name)`.
  *(my call — a dedicated entity rather than reusing tags, because line-level attribution and the
  800+ link need a stable typed target, and tags are free-form)*
- **Whole-expense attribution:** `ExpenseChild { expenseId, childId, share }` — one or more children
  per expense; with several children the amount is split equally unless edited. *(my call)*
- **Line attribution:** `ExpenseItem.childId` (nullable). When any line of an expense is attributed,
  the expense's child total is the sum of those lines (discounts folded proportionally, as receipt
  splits already do); whole-expense attribution and line attribution are mutually exclusive per
  expense. *(my call)*
- **Learned suggestions:** `ProductChildRule { accountId, productKey, childId }` keyed like
  `ProductRulesService` keys products. Written when the user attributes a line; offered (never
  applied silently) on the next scan containing that product. *(my call)*
- **800+:** an income is 800+ when the user marks it (`Income.childBenefitChildId`), and the app
  *suggests* the mark for incomes whose description matches the ZUS payout wording ("800+",
  "Rodzina 800 plus", "świadczenie wychowawcze"). One payment per child per month; coverage =
  benefit received ÷ child spending, same period. *(my call)*

## Where attribution happens

- Expense create/edit form: a "For" chip row listing children (multi-select).
- Receipt confirm card and expense detail: per-line "child" picker, with the learned suggestion
  pre-highlighted but not applied.
- Bulk: the transactions multi-select gets "Assign to child".
- Bots and chat: out of scope for v1. *(my call)*

## The Child costs screen

Entry from Analytics (a "Children" section) and from Settings → Children (manage names). Per child:
month and year totals, average per month over the attributed history, category breakdown (split-
aware, same rule as the rest of Analytics), 12-month bars, the 800+ coverage line when there is
benefit income, and actions: **Share card**, **Statement PDF**. Computed on the device from local
data, like the other Analytics breakdowns; desktop gets the dense table layout of the desktop
design language. Phone and desktop ship together.

## Share card

Thin wrapper over `ShareImageCard`: child's name (optional — a toggle hides it, default hidden
*(my call)*), year, total, average per month, 800+ coverage percentage. No merchant names.

## Statement PDF (Pro)

Generated by the reports PDF pipeline (`modules/reports`), for one child and a date range:
cover page (child's name, period, generated date, the parent's account name — no address), totals
by category and by month, a line table (date, merchant, description, category, amount, whether it
was a whole expense or a receipt line), then an appendix with each stored receipt image used, one
per page, downscaled. Footer on every page: "Zestawienie sporządzone w aplikacji AI Budżet na
podstawie danych wprowadzonych przez użytkownika" (localised). Gated by the existing tier guard and
paywall flow. Accounts at `encryptionTier >= 2` cannot generate it (the server cannot read the
amounts) and see why. *(my call)*

## Pricing

Children, attribution, the screen and the share card are free. The statement PDF is Pro.
*(my call — the PDF is the acute paid pain; the rest drives habit and sharing)*

## Privacy and data rules

- Child names are personal data of minors: never sent to any model, never in logs, never in
  telemetry, excluded from the community layers, deleted with the account and included in the
  account backup export.
- Viewers see children and totals but cannot attribute (standard `canEdit` / `ViewerBlockGuard`).

## Success after 3 months *(my call)*

- ≥ 10% of accounts with any receipt scans create at least one child.
- Of those, ≥ 50% attribute something in two different months.
- ≥ 3% of child-users generate a statement PDF; share card opened by ≥ 15%.

## Decisions after the builder check *(all my calls)*

1. **Server is the source of truth for the PDF.** Before requesting a statement the app flushes its
   sync queue; if anything for that account is still pending (offline), it says so and does not
   request. The PDF states "data as of <timestamp>".
2. **PDF only for `encryptionTier = 0`.** Tier 1 encrypts merchant, description and receipt images,
   tier 2 also amounts; the server could print neither. Encrypted accounts see why. Receipt images
   are per expense (`Expense.receiptImage`), one per attributed expense in the appendix.
3. **`Child.name` is a tier-1 encrypted field**, like tag names (add it to `ENCRYPTION_FIELDS`).
4. **Receipt regeneration keeps line attribution where it can**: a new line whose product key matches
   an old attributed line inherits its child; the rest are cleared and the user is told how many
   attributions could not be carried over.
5. **Whole-expense vs line attribution:** the last action wins, after a confirmation ("Replace the
   per-line attribution with the whole expense?"). Bulk "Assign to child" skips expenses that have
   line attribution and reports how many it skipped.
6. **Sync:** `child` and `expense_child` become sync entity types (`expense_child` keyed by
   `(expenseId, childId)` with resolved server PKs, like `expense_tag`); `ExpenseItem.childId` and
   `Income.childBenefitChildId` travel in the existing expense-item and income payloads.
   `ProductChildRule` is server-only, written via the API when online and read at scan time, like
   product category rules.
7. **Visibility:** children are account-scoped, so every member of a shared account (viewers too)
   sees them. Separated parents are expected to keep children on a personal account; the user docs
   say so. Children are archived, never hard-deleted from the UI; archived children keep their
   attributions and can still produce statements. Account deletion removes them.
8. **Totals use the same spend predicate as the Analytics tab** (planned expenses, split receivables
   and the other existing exclusions) through one shared helper, so the PDF, the screen and
   Analytics never disagree.
9. **Currency:** totals in the user's display currency per `display-currency-conversion.md`; the PDF
   line table shows each line's original amount and currency; a line with an unknown rate is listed
   but excluded from totals, with a footnote.
10. **800+ suggestion runs on the device** (where descriptions are decrypted) and is only a
    suggestion; a missed or wrong one is acceptable because the user confirms.
11. **Statement PDF:** `@RequireTier('pro')`, editors and owners only (`ViewerBlockGuard`).

## Left to the builder

Schema details and migrations (schema + migration in one commit), sync payloads, i18n keys in all 9
locales, user docs, wiki page, desktop layout via aba-web-designer, PDF layout details within the
rules above.
