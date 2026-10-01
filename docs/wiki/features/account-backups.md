# Account backups (export / restore)

*Hub: [api](../api.md) · related: [client-id-resolution](client-id-resolution.md)*

## What this is

A user-facing JSON snapshot of one account — export it to a file, restore it into the same or
another account. Not the server's database backup: that is the nightly `pg_dump` in
`backup-db.yml` (see `docs/ops/restore-runbook.md`).

## Entry points

- `apps/api/src/modules/backups/backups.controller.ts` — `POST /backups/export`,
  `POST /backups/restore`, `GET /backups/history` (class-level `JwtAuthGuard` + `AccountContextGuard`)
- `apps/api/src/modules/backups/backups.service.ts` — `exportBackup`, `restoreBackup`, the
  per-entity `restore*` helpers, `RestoreAbort`
- `apps/mobile/src/services/reports.api.ts` — `downloadBackupData()` → `{ blob, fileName }`
- `apps/mobile/src/stores/reportStore.ts` — `exportBackup()` → `BackupExportResult`,
  `restoreBackup()`, `loadBackupHistory()`

## Key concepts

**Export** loads the account's live expenses (with items, tags, splits, project links), incomes,
budgets, categories, tags, projects, wallet balances and currency exchanges, serializes the result
**once**, and sends that string straight to the response body via `@Res()`. The filename travels in
`X-Backup-Filename` (plus `Content-Disposition`). The object carries `version` and `data` at the
**top level**, so restore validates it directly with no outer envelope.

**Restore** parses the JSON, rejects a missing or newer `version`, and replays categories, tags,
projects, budgets, wallet balances, expenses, incomes and exchanges, deduplicating by `clientId`
(categories by name + type, with `parentId` resolved in a second pass; tags by name). `overwrite` decides whether an existing match is updated or skipped.

**The mobile client calls export once** and reports a `BackupExportResult` status — `saved` (Android
SAF folder picker, with the path), `shared` (system share sheet), `cancelled`, or `error` — so the
UI only claims success when the file actually landed somewhere.

## Invariants

**Never re-serialize the export.** Returning `data: backup` through Nest tripled peak memory and
OOM-crashed the API. The service builds the JSON string once and the controller `res.send`s it.

**`Expense.receiptImage` is stripped from the export.** A `Bytes` field serializes to a per-byte
integer array (~4-6x its size) and was the main reason backups passed 50 MB; restore never reads it
back. It is set to `undefined` in JS after the query — query-level Prisma `omit` types as `never` in
this client setup.

**Never reuse a source row's `id`.** Ids are global primary keys; reusing them threw
`Unique constraint failed on (id)` when restoring into any account that still held those rows.
Created rows get fresh DB ids, and `expense.categoryId`/`income.categoryId` are remapped through the
old→new category-id map built while restoring categories (unmapped → `null`).

**Restore is atomic.** Everything runs in one interactive `$transaction` (timeout 180 s). Any
per-row error is collected and `RestoreAbort` is thrown to roll the whole thing back; the caller
gets the errors with empty counts. A partial import is worse than none, because a retry would then
dedup against half-restored data.

**The request body limit is 50 MB** (`express.json` in `main.ts`); with the API heap set by
`NODE_OPTIONS` in `docker-compose.prod.yml`. Keep the two in mind together when backups grow.

## Known gaps

- Restore writes only the expense row's own columns: line items, tags, category splits and project
  links are exported but **not** restored, despite the "with items, tags, splits, projects" comment
  in `restoreBackup`; nor are `merchant`, `depositAmount`, debt fields or `recurringId`/
  `recurringPeriod`. Every restored row is attributed to the restoring user.
- `POST /backups/restore` carries no `ViewerBlockGuard`, so a viewer of a shared account can restore
  into it.

## History

ABA-163 — streamed export, receipt-image strip, fresh ids, atomic restore.
