---
id: shared-account-transaction-attribution
title: '"Who added this?" — transaction attribution in shared accounts'
status: idea
priority: P2
created_at: 2026-05-11
jira_ticket:
---

# "Who added this?" — transaction attribution in shared accounts

## User story
As a member of a shared family account, I want to see who added each expense or income entry, so that I can understand our spending without having to ask each other.

## Value hypothesis
When multiple people (spouses, flatmates, business partners) share an account, unexplained transactions create friction and distrust. The current FAQ explicitly surfaces this gap: "Duplicate and Delete are only available for account owners and editors" (`user_docs/en/03-expenses-and-income.md:27`) implies there is role awareness, but there is no display of *who* added a transaction. Adding a small "by @name" label is low effort but high trust-building value for the shared-account use case, which is one of the app's key differentiators.

## Sketch
- Show the creator's display name on the expense/income detail screen (`app/expense/[id].tsx`, `app/income/[id].tsx`) as a subtle "Added by Mihail" label below the date.
- Also surface creator name in the transactions list as a small avatar or initials chip on the right side (only shown when the account has >1 member, to avoid clutter on solo accounts).
- Backend: `expenses` and `incomes` tables should already have a `createdByUserId` field (check schema); if missing, add it via migration. Populate from `request.userId` in the service layer.
- `shared-types`: add `createdByUserName?: string` to `Expense` and `Income` entity interfaces so the mobile app can display it without a separate user lookup.
- No new screen needed — pure data enrichment on existing screens.

## Open questions
- Does the Prisma schema already store `createdByUserId` on expenses/incomes? If not, backfill is needed for existing rows (use `NULL` = "unknown").
- Should attribution be visible to Viewer-role members, or only Editors/Owners?
- Display name vs. email — which is shown? (Display name is friendlier but may not be set.)

## Cost estimate
1–2 days if schema column exists; 3 days if schema migration + backfill required.
