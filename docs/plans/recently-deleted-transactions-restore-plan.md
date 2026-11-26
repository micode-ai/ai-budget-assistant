# Plan: Recently deleted — restore a transaction for 30 days

Idea: `docs/product-ideas/recently-deleted-transactions-restore.md`. Contract: `docs/contracts/recently-deleted.md`.

## Decisions
- No migration: `updatedAt` is the deletion time (every delete bumps it, a deleted row is never edited).
- Standalone `modules/recently-deleted` (Prisma only), so the large expenses/incomes services stay untouched.
- Purge is its own daily cron (04:15) in that module; no existing cron scanned soft-deleted rows.
- Restore guard: a debt repayment is refused while its debt is still deleted. Split receivables restore, but their guest links do not revive (expireForExpense already ran).
- E2EE rows list and restore as opaque payloads; revision history is not written (revisions record edits, not deletes).

## Checklist
- [x] Contract in docs/contracts
- [x] API: list endpoint, restore endpoint (viewer blocked), purge cron, module registered
- [x] Unit tests (restore PK resolution, expiry, debt guard, purge cutoff)
- [x] Typecheck
- [ ] Shared types (RecentlyDeletedRow, RestoreResult) in packages/shared-types
- [ ] Mobile: api client, store, offline restore via sync queue
- [ ] Mobile phone screen under Settings, "Undo" snackbar after single and bulk delete
- [ ] Desktop web (>=1024) layout
- [ ] 11 locales, user_docs (11 locales), help section registration
