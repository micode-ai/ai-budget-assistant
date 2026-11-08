# Contract: pending sync status indicator

Mobile-only, no API/schema change.

## `features/syncStatus/pendingSyncSummary.ts` (pure)
`summarizePending(rows: PendingRow[], now: number, opts?) -> PendingSyncSummary`
- `PendingRow = { entity: PendingEntity; status: 'pending'|'error'; oldestUpdatedAt: number; count: number }`
- `PendingSyncSummary = { waiting: number; failed: number; total: number; visible: boolean; byEntity: Record<string, number> }`
- `visible` = `failed > 0` OR a pending row older than `PENDING_VISIBLE_AFTER_MS` (5 min). `total` is always the full count.

## `db/pendingSyncRepository.ts`
`loadPendingRows(): Promise<PendingRow[]>` — one grouped query per table in `PENDING_SYNC_TABLES`, `WHERE sync_status IN ('pending','error')`. Web mock returns `[]`.

## `features/syncStatus/usePendingSync.ts`
`usePendingSync() -> { summary, refresh }` — refreshes on mount and every 30 s.

## `features/syncStatus/runManualSync.ts`
`runManualSync()` — the forced push+pull used by Settings → Data "Sync now" and the chip.

## `components/settings/PendingSyncChip.tsx`
Renders null when `!summary.visible`. Tap -> alert (explanation, per-entity counts) with "Sync now".

## Invariants
- Never counts rows by `sync_queue` (unused). Never `console.error` on failure (warn only).
- i18n namespace `pendingSync`, all 9 locales.
