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
- [receipt-category-split](features/receipt-category-split.md) — splitting one receipt's line items
  across categories at scan time, the deposit group, category proposals

### Documentation and content
- [help-content-pipeline](features/help-content-pipeline.md) — one markdown source feeding the
  in-app help screen and the public help center, and the three places a new section is registered

### Working in the mobile app
- [mobile-test-infrastructure](features/mobile-test-infrastructure.md) — how the Jest suite is
  wired, why nothing renders a component, and how module-scope side effects leak between files

### Categories
- [category-id-resolution](features/category-id-resolution.md) — how a category id is resolved
  between phone and server, and the five bugs that came from getting it wrong

## Health

[`wiki-health-trends.md`](wiki-health-trends.md) — appended by the `/wiki-health-scan` command.
Do not edit by hand.
