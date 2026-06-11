# Release Notes — AI Budget Assistant

Consolidated notes for every release, newest first. The version is `versionName` in
`apps/mobile/android/app/build.gradle` (source of truth for Google Play) and `version`
in `apps/mobile/app.json`. Russian translation: [`CHANGELOG.ru.md`](./CHANGELOG.ru.md).
Detailed per-feature notes for individual dates live alongside in `docs/release-notes/`
(e.g. `2026-04-16.md`).

---

## 1.6.0 — 2026-06-11

**Anomaly alerts**
- **The app now watches your money for you** — it proactively flags unusual activity: a possible duplicate charge, a subscription or recurring payment that got more expensive, a merchant that "looks like a subscription", or a category spike well above your usual. Tap the new bell on the home screen to see every alert, and turn them on/off in Settings → Notifications (ABA-242).
- Alerts work for expenses added by hand, by voice, from receipts, via the bots, and from bank imports; the duplicate-charge check matches by merchant **or** description, so a copied expense is caught even without a merchant (ABA-245).

**Refreshed home & header**
- **New unified header** across the home screen and every tab — the account and display currency are now separate pills, the greeting was removed for a cleaner look, and a white divider tidies the layout (ABA-243).
- **Quick actions wrap to rows** — every shortcut is visible at once instead of hiding behind a horizontal scroll, with refreshed brand icons (ABA-244).

**Fixes**
- Amount fields now accept a **comma** as the decimal separator (ABA-241).
- Web: fixed logout not clearing the session, so you stay logged out after a refresh (ABA-235).
- Belarusian: added the missing encryption-screen translations (ABA-236).

---

## 1.5.1 — 2026-06-07

**Web app**
- **AI Budget Assistant is now on the web** — open it right in your browser at [ai-budget.pl](https://ai-budget.pl). Log in, manage accounts, add expenses and income, chat with the AI, and browse your dashboard — no install needed (ABA-213, ABA-214).
- Web parity polish — reference-data screens, login/chat **Enter to submit**, centered action strips, dialogs, lists, tab bar, and safe-area fixes; debts now feed the Financial Health score correctly on web (ABA-218, ABA-220).

**Subscription Manager**
- **Track your recurring charges** (Netflix, gym, SaaS…) in one place — add a subscription with its amount, billing cycle, and next renewal date, and see your monthly total at a glance. Reachable from Settings, the home quick-action strip, and the Fat Finder "Track this" button (ABA-208, ABA-209).
- Get a **reminder 3 days before** each renewal, and the app can **auto-record the expense** on the renewal date and advance to the next cycle (ABA-211).

**Home screen**
- **Customize your quick actions** — choose which shortcuts appear in the home strip and drag to reorder them, right alongside the widget settings (ABA-207).

**Languages**
- Added **Dutch (Nederlands)** across the app, bots, and help docs (ABA-204).

**Chat bots**
- **Slack: add to any workspace** — connect the Slack bot through a one-tap "Add to Slack" install flow, with each workspace's token encrypted at rest (ABA-200).

**Admin**
- Sortable **Users** table (name, email, registered, last login) and clickable **App Versions** rows that open full release details (ABA-202).

**Fixes**
- Fixed AI chat where your message bubbles could wrap one character per line (ABA-206).
- Fixed a doubled Financial Health widget and the detail breakdown collapsing on mobile (ABA-219, ABA-221).
- Fixed the Subscriptions list row where the delete button overlapped the amount (ABA-212).

---

## 1.4.1 — 2026-06-04

**Chat bots**
- New **Slack bot** — connect your account to Slack and manage money straight from a direct message: AI chat, add expenses and income by text or voice, scan receipt photos, manage budgets and categories. Full feature parity with the Telegram and WhatsApp bots; link with a 6-character code (ABA-194).
- The Slack bot shows a **💭 "thinking" indicator** while it works, and echoes the recognized transcript for voice messages, so it's always clear it's processing (ABA-196).

**Home screen**
- **Financial Health Score** — a single 0–100 gauge on the Dashboard summarizing budget adherence, savings rate, goal progress, and debt health, computed entirely on-device with no AI cost (ABA-193).
- **Reorder your Dashboard widgets** — drag the handle in Settings → Dashboard Widgets to arrange the home screen your way; "Reset to default order" restores the original layout (ABA-189).

**Income**
- Capture income by **voice** or by **scanning an invoice/receipt** — the same fast capture flow already available for expenses (ABA-190).

**Under the hood**
- Refactored the chat screen into focused hooks and components (ABA-198).

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
