# Release Notes — AI Budget Assistant

Consolidated notes for every release, newest first. The version is `versionName` in
`apps/mobile/android/app/build.gradle` (source of truth for Google Play) and `version`
in `apps/mobile/app.json`. Russian translation: [`CHANGELOG.ru.md`](./CHANGELOG.ru.md).
Detailed per-feature notes for individual dates live alongside in `docs/release-notes/`
(e.g. `2026-04-16.md`).

---

## 1.3.1 — 2026-06-02

**Currency**
- Switch your **display currency** straight from the account switcher — the pill now shows the base-currency symbol (e.g. `Personal · $`), and its menu has a **Display currency** chip for each supported currency. Changing it instantly reconverts every total across the app, for all roles (ABA-187).

**Stability**
- Fixed a crash on launch where the app would close right after opening (and Samsung Device Care reported it "crashing frequently"). It happened when Android restored the app after the OS had killed it in the background (ABA-188).

**Under the hood**
- Faster investment asset-price updates and transaction creation (ABA-186).
- Internal refactors and more test coverage — large screens/hooks split into focused modules, tighter API typing (ABA-180, ABA-181, ABA-182, ABA-183, ABA-184, ABA-185).

---

## 1.3.0 — 2026-05-30

**Analytics**
- New **Top merchants** breakdown on the Analytics tab — where you spend the most, by merchant (ABA-171).
- **Income breakdown by category** (donut), alongside the existing expense breakdown (ABA-175).

**Bulk expense operations** (ABA-173 + fixes)
- Multi-select: select several expenses and **set category**, **add tag**, or **delete** them at once.
- Long-press a row again opens the **Edit / Duplicate / Delete** menu; bulk mode is the **Select multiple** item (long-press regression fixed, ABA-168).
- Fixed bulk **delete** where expenses reappeared after refresh — two causes: server route ordering and local-id (`clientId`) resolution (ABA-166).
- Fixed **tag assignment**: server-side links weren't saved due to a tag-id mismatch — added reconciliation via `Tag.clientId`; tags now load in the bulk picker (ABA-167).

**Import**
- **Revolut statement import** (CSV) (ABA-176).

**Under the hood**
- Sync payload typed per entity, no `as any` casts (ABA-174).
- Docs: `PATCH /expenses/bulk` endpoint, bulk operations, tag reconciliation, Revolut — in both technical and user help (ABA-177).

> Production infrastructure (encrypted off-site DB backups, disk/container monitoring, log rotation, DR runbook, build-cache pruning on deploy) shipped in 1.2.0 (below) and continues to run.

---

## 1.2.0 — 2026-05-29

Large release: ~196 commits after 1.0.0. Main themes.

**Bank & transfer import**
- Polish bank statement import: **mBank, PKO** (CSV), **Erste, Alior** (PDF), universal column mapping; **Wise import** (CSV).
- **Import history** with rollback and deduplication; request-a-bank flow.

**Expenses & categorization**
- **Merchant** field on expenses (OCR / import / manual), **merchant management** screen (rename / merge / delete).
- Recurring expenses, category splits, project links.

**AI & bots**
- **Telegram** and **WhatsApp** bots: AI chat, voice (Whisper), receipt OCR.
- Shared AI chat for shared accounts; AI commands for debts and savings goals.

**Finance**
- **Debts & loans**, **savings goals**, **investment portfolio**, **referrals**, **gamification**.
- Wallet, currency exchange, account transfers; initial-balance editing.

**Security & privacy**
- **End-to-end encryption** of sync (E2EE) with recovery.
- **Viewer** role (read-only) with write blocking on the server, in AI chat, and in bots.

**Performance & infrastructure**
- Caching layer (Redis), restart-resilient throttling, connection pool, parallel sync.
- **Automated PostgreSQL backups**: nightly, encrypted (`age`), off-site to GitHub Releases, GFS retention, Telegram alerts, restore runbook.
- **Fault tolerance**: disk/container monitoring, Docker log rotation, full-server-rebuild DR runbook, build-cache pruning on deploy.

**Other**
- Scenario simulator, widgets, reference-data hub, unified bots screen, app-version gate, and more.

---

## 1.0.0 — 2026-04-10

First public release.

- **Expense & income** tracking, **budgets** with periods and history.
- **Analytics**: breakdowns, trends, drill-down, calendar.
- **AI assistant**: financial Q&A and actions via chat (create expenses/budgets, etc.), with automatic language detection (8 languages).
- **Multi-account** (personal / shared / business) with roles and invitations.
- **Voice input** and **receipt scanning** (OCR).
- Wallet and multi-currency, tags, projects.
- Offline-first: local SQLite + server sync.
- 8 UI languages, dark / light themes.
