# Sample-data explore mode

*Hub: [mobile-app](../mobile-app.md)*

## What this is
A brand-new user can tap "Try with sample data" on the get-started screen and see the dashboard, budgets and analytics filled with about three months of generated transactions. It is local-only: the data lives in SQLite and the server never hears of it.

## Entry points
- `apps/mobile/src/features/demo/demoAccount.ts` — `isDemoAccountId`, `DemoAccountOfflineError`
- `apps/mobile/src/features/demo/demoData.ts` — pure deterministic generator
- `apps/mobile/src/features/demo/demoSession.ts` — `startDemo` / `exitDemo`
- `apps/mobile/src/components/demo/DemoBanner.tsx`, `GetStartedMobile.tsx`
- Contract: `docs/contracts/sample-data-explore-mode.md`

## Invariants
- Demo ids start with `demo-`; `http-client` throws before fetch for them, so nothing reaches the server (admin metrics, DAU, referrals, push are excluded by construction).
- Rows are written straight to SQLite as `synced`, never through the sync queue.
- `startDemo` marks first-run seen before seeding, since onboarding counts SQLite rows.
- `exitDemo` deletes every row of EVERY `demo-` account and restores the previous account. The demo account is editable, so the user may add rows to any account-scoped table: tables are discovered from the SQLite schema (`account_id` column, plus child rows hanging off an account-scoped parent via `expense_id`/`income_id`/`budget_id`/`goal_id`/`debt_id`), never listed by hand.
- A failed `startDemo` purges whatever it seeded before rethrowing.

## Known gaps
Native only (web has no SQLite). No demo goal yet, no AI chat empty state, banner only on the phone dashboard.

## History
ABA-723.
