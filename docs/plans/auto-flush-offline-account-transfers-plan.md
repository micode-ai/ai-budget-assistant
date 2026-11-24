# Plan: auto-flush offline account transfers

Idea: `docs/product-ideas/auto-flush-offline-account-transfers.md`. Mobile-only, no API/schema change.

- [x] 1. Read the queue (`syncPendingTransfersAction`, `loadPendingTransfers`) and the connectivity signal (`useConnectivityStore`).
- [x] 2. Contract: `docs/contracts/transfer-queue-auto-flush.md`.
- [x] 3. Pure `features/wallet/transferQueueFlusher.ts` (in-flight guard + min-interval throttle).
- [x] 4. Hook `hooks/useTransferQueueAutoFlush.ts` (offline->online transition + AppState active), wired in `app/_layout.tsx`.
- [x] 5. Tests: drain, no double-send while in flight, throttle, never throws.
- [x] 6. Wiki `features/account-transfers.md`, log line, user docs note.
- [x] 7. Idea frontmatter `status: building`.

## Decisions on open questions
- **Share the generic `/sync` trigger?** No: `/sync` has no connectivity listener of its own either (only `loadWallet` / manual sync); the transfer queue needs the wallet store's account scope, so it gets a small own trigger on the shared `useConnectivityStore`.
- **Back-off after rejections:** none needed. A 4xx marks the row `error` and removes it from the queue (existing behaviour); transport failures are already paced by `connectivityCore` back-off, plus a 15 s minimum interval between flushes.
- **Creator attribution:** not in this task (needs a schema/DTO change; stays in Known gaps).
- **Pending indicator:** already covers `account_transfers` via the pending-sync chip; unchanged.
- **Scope limit:** flushes the current account's queue (the push travels under one `X-Account-Id`).
