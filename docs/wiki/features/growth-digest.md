# Weekly growth digest

## What this is
This is a plain-text weekly report sent to the ops Telegram channel. It covers signups by source, the activation of last week's cohort, active users and transactions. It is meant to show a trend without opening the admin. It runs no model and writes nothing.

## Entry points
- `scripts/growth-digest.sh` holds the SQL. It runs on the VPS through `docker exec … psql`.
- `.github/workflows/growth-digest.yml` runs every Monday at 07:00 UTC, plus `workflow_dispatch`. It pipes the script over SSH (`'bash -s' <`) and posts stdout to the ops channel.

## Key concepts
- Every figure compares the last 7 days with the 7 before.
- Internal accounts are left out of every figure. They are the `ADMIN_EMAILS` list, read from `.env.production` on the box. This matches the admin Activation and Telemetry pages.
- Transactions are counted from `created_at` on `expenses` and `incomes`, excluding soft-deleted rows. They are split into three lines: **logged (not imported)**, **imported**, and **users who imported**. A row counts as imported when `source = 'import'`, or it has an `import_batch_id`, or it has an `external_ref`.

## Invariants
- **Keep imported rows separate from logged ones.** One statement import or competitor-app migration writes thousands of rows at once (see [bank-statement-import](bank-statement-import.md) and [competitor-app-migration](competitor-app-migration.md)). Summed into one total, it swamps the engagement signal. On 2026-11-24 the total read 4079 | 161 while active users rose.
- Read-only: SELECTs inside `BEGIN TRANSACTION READ ONLY`. Never print an address. The internal list is used only as a filter.

## Known gaps
- A backup restore may keep its rows' original `source`, so it could count as hand-logged. This has not been checked.
- "Active users" is `users.last_sync_at`. That is the last-activity stamp ([last-active-tracking](last-active-tracking.md)), not the number of users who logged something.

## History
- ABA-740 added the digest.
- [ABA-840](https://github.com/micode-ai/ai-budget-assistant/issues/878) split imported rows from the transactions total.
