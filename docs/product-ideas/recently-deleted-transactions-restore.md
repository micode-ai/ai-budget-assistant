---
id: recently-deleted-transactions-restore
title: 'Recently deleted: restore a transaction for 30 days'
status: building
priority: P2
created_at: 2026-11-24
jira_ticket:
orchestration_run: 4c70efca-dc41-4995-b699-80de5e412cab
---

# Recently deleted: restore a transaction for 30 days

## User story
As a user who deleted an expense or income by mistake (or in a bulk operation), I want to find it in a "Recently deleted" list and restore it, so that a mis-tap does not cost me data I have to re-enter.

## Value hypothesis
Deletes are soft (`isDeleted`) but the user has no way back, and bulk delete makes slips more expensive. Undo is one of the most trusted features in a finance app; the chat already has an undo for its own writes, but nothing covers deletes made in the UI.

## Sketch
- Settings entry "Recently deleted" listing soft-deleted expenses and incomes of the current account, newest first.
- Restore action per row and for multi-select; restoring goes through the normal sync queue so it works offline.
- An "Undo" snackbar right after a single or bulk delete, as the fast path.
- Server purges soft-deleted rows older than 30 days in an existing daily cron.
- Viewer role sees the list read-only.

## Open questions
- Do linked rows (split receivables, debt repayments, recurring series) restore cleanly or need a guard?
- Does restore interact with E2EE tiers or the transaction revision history?
- Are soft-deleted rows already purged anywhere, which would change the window?

## Cost estimate
About 1 week: list endpoint, restore path, purge cron, phone and desktop screens, locales.
