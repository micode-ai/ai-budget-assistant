# Contract: Sample-data explore mode

Local-only demo. No API, schema or migration change.

## Modules (`apps/mobile/src/features/demo/`)
| File | Exports | Rule |
|---|---|---|
| `demoAccount.ts` | `DEMO_ACCOUNT_PREFIX='demo-'`, `isDemoAccountId(id)`, `DemoAccountOfflineError` | Pure. The only way to ask "is this a demo account". |
| `demoData.ts` | `buildDemoData({accountId,userId,currencyCode,now,categoryIds})` → `{expenses,incomes,budgets}` | Pure, deterministic (seeded PRNG), ~90 days, all rows `syncStatus:'synced'`, ids prefixed `demo-`. |
| `demoSession.ts` | `startDemo()`, `exitDemo()` | Writes SQLite directly (never the sync queue). Remembers the previous account id (MMKV `demo-session`). |

## Invariants
- Demo rows are `syncStatus: 'synced'` and never enter `pendingSync`; `http-client` throws `DemoAccountOfflineError` before fetch when the account id is a demo id.
- A demo account is never pushed; `exitDemo` deletes every row with that `account_id` and the account row, then restores the previous account.
- Not offered on web (no SQLite) or when the user already has transactions.
- First-run routing counts SQLite rows: `startDemo` calls `markSeen()` first, so demo rows cannot re-trigger onboarding; `exitDemo` routes back to `/get-started` explicitly.
- AI chat for a demo account is not called (no server account, no token cost).
