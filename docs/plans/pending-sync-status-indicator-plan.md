# Plan: pending sync status indicator

Idea: `docs/product-ideas/pending-sync-status-indicator.md`. Run `fce866c4-52aa-49f3-8d3d-c2d9d66988e1`.

## Findings
- No existing surface shows this: `pendingCount` in the settings hub is purchase requests; `DataSettings` shows only "Last synced" + "Sync now".
- The `sync_queue` table is declared but unused. The real pending marker is `sync_status` on each entity table ('pending' | 'error'), so the selector counts those rows.
- Web has no SQLite (mock), so the indicator renders nothing on web.

## Decisions (open questions)
- Threshold: a `pending` row only counts toward the chip after 5 minutes (a brief offline stretch stays quiet); `error` rows show immediately.
- Detail = alert with explanation + "Sync now" (no new sheet component, smaller scope).
- Entities counted: expenses, incomes, account_transfers, currency_exchanges, budgets, investment_transactions.

## Checklist
- [x] Plan + contract (`docs/contracts/pending-sync-status-indicator.md`)
- [x] Pure summary module + unit test
- [x] SQLite repository (counts per table)
- [x] `usePendingSync` hook + shared `runManualSync`
- [x] `PendingSyncChip` in DataSettings (mobile + desktop pane) and SettingsHubMobile
- [x] i18n `pendingSync` x 9 locales
- [x] Wiki page + log line, user_docs note
- [x] Idea frontmatter -> building; commit
