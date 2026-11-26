# Plan: credit card statement cycle tracker (`credit-card-statement-cycle-tracker`)

Decisions (non-interactive run, simplest path chosen):
- Open question 1: no account-level field fits and `WalletBalance` is per currency, so the card setting is a NEW standalone model `CardCycleSetting` (one per account, unique `accountId`). Server-only: the summary is computed by the API from expenses, so no SQLite mirror (web has none anyway).
- Cut-off uses the transaction date (`Expense.date`), and the UI says so.
- Cycle maths is a pure util, duplicated API <-> shared-utils (mirror rule), parity test in the app.
- Out of scope this pass: Safe-to-Spend subtraction switch (follow-up), interest / minimum payment.
- The push reuses the `debt_reminder` notification type (gated by the existing debt-reminders switch) to avoid a User migration.

## Checklist
- [x] 1. Plan
- [x] 2. Contract `docs/contracts/credit-card-statement-cycle.md`
- [x] 3. Cycle util + mirror + tests
- [x] 4. Prisma model + migration
- [x] 5. API module `card-cycles` (GET/PUT/DELETE, summary), cron push, notification strings
- [x] 6. Mobile: api method + wallet card section + settings sheet + i18n (11 locales)
- [x] 7. Wiki page, log line, user docs, finish-aba-task
- [x] 8. Idea frontmatter -> `building`
