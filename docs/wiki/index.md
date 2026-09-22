# Wiki index

Domain-by-domain reference for the AI Budget Assistant monorepo. Start here, pick the hub for the
area you are working in, then the feature page.

Design and conventions: [`docs/superpowers/specs/2026-09-22-llm-wiki-design.md`](../superpowers/specs/2026-09-22-llm-wiki-design.md).
Ingest ritual: the `finish-aba-task` skill. Journal: [`log.md`](log.md).

> **Migration in progress.** `CLAUDE.md` is being drained into this wiki one feature per task
> (design decision 2). A subject with no page here is still described in `CLAUDE.md` — that file
> remains authoritative for anything not yet listed below. A migrated subject leaves behind only a
> pointer, so it is never described in two places.

## How to read a page

Every page follows one shape: **What this is** · **Entry points** · **Key concepts** ·
**Invariants** · **Known gaps** · **History**. If you are about to change code, `Invariants` is
the section you came for — it states what must not break and why. A missing section means
"not yet examined", not "nothing to say".

## Hubs

| Hub | What it covers |
|---|---|
| [api](api.md) | NestJS REST API — modules, Prisma/PostgreSQL, JWT + account-scoped auth |
| [mobile-app](mobile-app.md) | Expo / React Native offline-first app — Zustand stores, SQLite, 9-locale i18n |
| [admin-dashboard](admin-dashboard.md) | Next.js operator dashboard — users, AI usage, comms, releases |
| [auth](auth.md) | Registration, JWT lifecycle, Google sign-in, account membership and roles |
| [offline-sync](offline-sync.md) | Local-first writes, the sync queue, pull/merge, id resolution |
| [ai-features](ai-features.md) | Chat, function calling, voice (Whisper), receipt OCR |
| [analytics-insights](analytics-insights.md) | Charts, category breakdowns, insights and reports |
| [subscriptions](subscriptions.md) | Stripe, tiers, AI usage limits, paywalls |
| [telegram-bot](telegram-bot.md) · [whatsapp-bot](whatsapp-bot.md) · [slack-bot](slack-bot.md) | The three chat bots |
| [shared-types](shared-types.md) · [shared-utils](shared-utils.md) | The two shared packages |

## Feature pages

### Splitting a bill with people who do not have the app
- [receipt-split](features/receipt-split.md) — guest links, the unauthenticated surface,
  split-receivable accounting, payment-method resolution
- [receipt-split-item-shares](features/receipt-split-item-shares.md) — per-line claims, shared
  lines, explicit percentages, discount scaling, guest disputes and reassignment

### Offline-first and identity
- [offline-first-sync](features/offline-first-sync.md) — the write/push convention, `SyncService`'s
  per-entity handlers, which entity types actually travel through the queue
- [client-id-resolution](features/client-id-resolution.md) — local id vs server primary key, create
  idempotency, and why some bugs reproduce only on web

### Receipts
- [receipt-price-check](features/receipt-price-check.md) — comparing each scanned line against the
  median of what this user paid for it before, at that store
- [receipt-category-split](features/receipt-category-split.md) — splitting one receipt's line items
  across categories at scan time, the deposit group, category proposals

### Web, marketing site and growth
- [web-build-and-hosting](features/web-build-and-hosting.md) — the Expo web build, platform splits,
  the two nginx containers, and the deploy traps that have bitten
- [marketing-site](features/marketing-site.md) — the three static generators, nine languages, and
  the regeneration commands that must not be run with the wrong environment
- [acquisition-tracking](features/acquisition-tracking.md) — link tagging, first-touch capture,
  GA4 events, Play install referrer
- [directory-badges](features/directory-badges.md) — the footer badge row and its width arithmetic

### Documentation and content
- [help-content-pipeline](features/help-content-pipeline.md) — one markdown source feeding the
  in-app help screen and the public help center, and the three places a new section is registered

### AI chat
- [chat-conversation-management](features/chat-conversation-management.md) — rename, delete, pin,
  and the sharing control

### Screens and platform surfaces
- [expense-location-and-map](features/expense-location-and-map.md) — geocoding, the pin picker, and
  a map with no native map module
- [desktop-transactions-screen](features/desktop-transactions-screen.md) — the reference screen of
  the desktop design language
- [first-run-onboarding](features/first-run-onboarding.md) — routing a brand-new user, and the web
  dashboard state that replaces it there
- [settings-desktop-shell](features/settings-desktop-shell.md) — the two-pane settings layout and
  its pane-vs-link rule
- [report-periods](features/report-periods.md) — range selection, report generation, file export

### Auth
- [restore-credentials](features/restore-credentials.md) — WebAuthn so a session survives an Android
  device transfer

### Working in the mobile app
- [mobile-test-infrastructure](features/mobile-test-infrastructure.md) — how the Jest suite is
  wired, why nothing renders a component, and how module-scope side effects leak between files

### Money movement and lists
- [account-transfers](features/account-transfers.md) — moving money between accounts, and the only
  feature with its own offline write queue
- [shopping-list](features/shopping-list.md) — offline-first lists, basket comparison, restock and
  deal pushes, receipt reconciliation

### Importing
- [ai-statement-import](features/ai-statement-import.md) — inferring a column mapping when no bank
  parser recognises the file, and extracting PDF rows

### Alerts and insights
- [anomaly-alerts](features/anomaly-alerts.md) — rule-based alerts fired on expense write
- [inflation-shield](features/inflation-shield.md) — price forecasting and stock-up advice

### Trips
- [trip-wallet](features/trip-wallet.md) — the trip account type, multi-way splitting, settle-up

### Instrumentation
- [web-telemetry](features/web-telemetry.md) — first-party product analytics for the web build only

### Categories
- [category-id-resolution](features/category-id-resolution.md) — how a category id is resolved
  between phone and server, and the five bugs that came from getting it wrong

## Health

[`wiki-health-trends.md`](wiki-health-trends.md) — appended by the `/wiki-health-scan` command.
Do not edit by hand.
