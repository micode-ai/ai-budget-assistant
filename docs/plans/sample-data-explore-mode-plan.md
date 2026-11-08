# Plan: Sample-data explore mode (`sample-data-explore-mode`)

Decision: **local-only (SQLite) demo**, native only. No server row, no migration, so admin metrics, DAU,
referral qualification and push are untouched by construction. The demo account id is `demo-<uuid>`;
`isDemoAccountId` is the single predicate. The HTTP client refuses any request scoped to a demo account.
AI chat: needs the server and the server does not know the account, so chat shows a "not available in
sample data" state instead of spending tokens. Web has no SQLite, so the button is hidden there (known gap).

## Tasks
- [x] 1. Contract `docs/contracts/sample-data-explore-mode.md`
- [x] 2. `features/demo/demoAccount.ts` — `isDemoAccountId`, `DEMO_ACCOUNT_PREFIX`
- [x] 3. `features/demo/demoData.ts` — pure deterministic generator (~3 months, 2 budgets), unit-tested
- [x] 4. `http-client` guard: demo account never reaches the network
- [x] 5. `features/demo/demoSession.ts` — `startDemo` / `exitDemo` (SQLite seed + teardown, account switch)
- [x] 6. UI: "Try with sample data" button on `GetStartedMobile`, `DemoBanner` ("Start fresh")
- [x] 7. i18n, 9 locales
- [ ] 8. Follow-ups (not in this run): goal (device-local MMKV, not yet seeded), AI chat empty state, banner on every tab, web variant
