# Contract: transfer queue auto-flush

Mobile-only, no API/schema change. Only the trigger is new; the queue, idempotency (`localId`) and 4xx handling stay in `syncPendingTransfersAction`.

## `features/wallet/transferQueueFlusher.ts` (pure)
`createTransferQueueFlusher({ flush, now, minIntervalMs? }) -> { request(): Promise<boolean> }`
- Resolves `true` if a flush ran, `false` if skipped (already in flight, or within `minIntervalMs` of the last start; default 15 000).
- Never throws: a rejected `flush` is `console.warn`ed.
- At most one `flush` in flight, so two triggers at once cannot double-send.

## `hooks/useTransferQueueAutoFlush.ts`
`useTransferQueueAutoFlush(enabled: boolean)` — when enabled, requests a flush when `useConnectivityStore` goes `offline` -> `online`, and on `AppState` `active`. Calls `useWalletStore.getState().syncPendingTransfers()`.

## Invariants
- Never `console.error`; warn only.
- No new queue, no new idempotency key.
- Does not run while signed out.
