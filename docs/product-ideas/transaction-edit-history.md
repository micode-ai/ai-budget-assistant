---
id: transaction-edit-history
title: 'Show who changed a shared transaction and what it was before'
status: building
priority: P2
created_at: 2026-11-08
jira_ticket:
orchestration_run: b4569247-fc5a-421e-8df9-0e13c83681fc
---

# Show who changed a shared transaction and what it was before

## User story
As a member of a shared or family account, I want to see who last edited a transaction and what the amount or category used to be, so that I can understand why the totals moved without asking everyone.

## Value hypothesis
Shared accounts already show who created a transaction (`createdByUserName`), but an edit is invisible: an amount silently changes and the budget shifts. Trust is the main friction in shared money, and an "edited by Anna, 12 → 15" line removes the argument. A search for last-edited, edit history and audit fields found nothing in the Prisma schema or the idea backlog.

## Sketch
- Add a lightweight `ExpenseRevision` / `IncomeRevision` row (changed fields as a JSON diff, `userId`, timestamp), written in the same transaction as the update.
- Show "Edited by X" under the creator line on the detail screen, with a "History" sheet listing before and after values.
- Only for accounts with more than one member, so single-user data stays unchanged.
- Skip encrypted (tier 1+) fields, or store them already encrypted.
- Optional later: a Family Feed event on a large amount change.

## Open questions
- Retention: keep all revisions or only the last N?
- Does the offline sync path (`/sync` upsert) know the editing user?
- Could a diff of E2EE fields leak anything?

## Cost estimate
About 1 week: one migration, a write hook in the update paths, one detail sheet, nine locales.
