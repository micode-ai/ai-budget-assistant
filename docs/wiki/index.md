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
- [web-data-loading](features/web-data-loading.md) — loading with no local database: failed vs
  empty loads, retries, sign-out resets, and the proxy limit behind `Failed to fetch`

### Receipts
- [receipt-duplicate-warning](features/receipt-duplicate-warning.md) — warning before the same receipt
  is recorded twice (same file before OCR, same receipt after)
- [receipt-price-check](features/receipt-price-check.md) — comparing each scanned line against the
  median of what this user paid for it before, at that store
- [receipt-category-split](features/receipt-category-split.md) — splitting one receipt's line items
  across categories at scan time, the deposit group, category proposals
- [receipt-image-memory](features/receipt-image-memory.md) — downscaling receipt photos to stay
  under Google Play's memory thresholds
- [categorize-uncategorized](features/categorize-uncategorized.md) — one batched review that turns a
  pile of uncategorized expenses into a handful of categories, reviewed before anything is written
- [bot-categorize-command](features/bot-categorize-command.md) — the same review as a sequential
  Yes/Skip/Stop chat flow for Telegram, WhatsApp and Slack
- [merchant-category-rules](features/merchant-category-rules.md) — learning a merchant's category
  from a manual edit or a bulk recategorization, and applying it at import and categorize time

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
- [chat-spending-questions](features/chat-spending-questions.md) — split-aware category answers and
  line-item product search
- [chat-undo-last-action](features/chat-undo-last-action.md) — revert the most recent confirmed
  chat or bot write
- [deposit-and-discount-totals](features/deposit-and-discount-totals.md) — deposit and discount
  answers from the columns, in chat and on the Analytics tab
- [shared-conversations](features/shared-conversations.md) — group chat per conversation,
  mentions that silence the AI, presence, polling, the cold-start deep link
- [display-currency-conversion](features/display-currency-conversion.md) — one display currency for
  every server-side total and narration, `common/utils/fx.ts`, currency-aware caches

### Bots
- [bot-receipt-editing](features/bot-receipt-editing.md) — typed line-item and total corrections to a
  scanned receipt, on all three bots

### Screens and platform surfaces
- [desktop-web-shell](features/desktop-web-shell.md) — the top bar and content area every desktop
  screen sits in, and the one width gate
- [expense-location-and-map](features/expense-location-and-map.md) — geocoding, the pin picker, and
  a map with no native map module
- [desktop-transactions-screen](features/desktop-transactions-screen.md) — the reference screen of
  the desktop design language
- [desktop-dashboard](features/desktop-dashboard.md) — the home tab's rail layout, its readiness
  rules, and the chart traps behind them
- [desktop-chat-screen](features/desktop-chat-screen.md) — the conversation rail and reading column
- [desktop-keyboard-shortcuts](features/desktop-keyboard-shortcuts.md) — the fixed key bindings, the
  registry behind them, and the cheat sheet
- [first-run-onboarding](features/first-run-onboarding.md) — routing a brand-new user, and the web
  dashboard state that replaces it there
- [settings-desktop-shell](features/settings-desktop-shell.md) — the two-pane settings layout and
  its pane-vs-link rule
- [report-periods](features/report-periods.md) — range selection, report generation, file export

### Auth
- [restore-credentials](features/restore-credentials.md) — WebAuthn so a session survives an Android
  device transfer

### Telling users about things, and asking them for something
- [whats-new-spotlight](features/whats-new-spotlight.md) — the one-time nudge for already-shipped
  features
- [referral-program](features/referral-program.md) — the share link, and the one moment the app
  asks a user to invite a friend
- [store-rating-prompt](features/store-rating-prompt.md) — the Play rating request, its two
  throttles, and why it is marked before it fires

### Appearance
- [theme-customization](features/theme-customization.md) — mode and accent colour, derived brand
  tokens, and the precedence rule between server and device

### Working in the mobile app
- [date-pickers](features/date-pickers.md) — the one date component (the native library renders
  nothing on web), and converting date-only values without UTC
- [mobile-test-infrastructure](features/mobile-test-infrastructure.md) — how the Jest suite is
  wired, why nothing renders a component, and how module-scope side effects leak between files

### Money movement and lists
- [wallet-currencies](features/wallet-currencies.md) — which currencies get a balance card, and why a
  hidden one stays hidden
- [account-transfers](features/account-transfers.md) — moving money between accounts, and the only
  feature with its own offline write queue
- [shopping-list](features/shopping-list.md) — offline-first lists, basket comparison, restock and
  deal pushes, receipt reconciliation, the three AI chat tools

### Capturing expenses automatically
- [bank-notification-capture](features/bank-notification-capture.md) — Android bank pushes parsed on
  the device, the spend gate, and reconciliation with receipts and imports

### Importing
- [bank-statement-import](features/bank-statement-import.md) — Polish banks, Revolut and Wise: the
  parser registry, dedup, the commit transaction, batch rollback
- [ai-statement-import](features/ai-statement-import.md) — inferring a column mapping when no bank
  parser recognises the file, and extracting PDF rows
- [competitor-app-migration](features/competitor-app-migration.md) — Monefy, Wallet and Money
  Manager exports, carrying the user's own categories across

### Alerts and insights
- [exchange-rate-alerts](features/exchange-rate-alerts.md) — a personal one-shot watch on a currency
  pair
- [community-prices](features/community-prices.md) — the k-anonymized crowdsourced price map,
  currently dark in production
- [anomaly-alerts](features/anomaly-alerts.md) — rule-based alerts fired on expense write
- [inflation-shield](features/inflation-shield.md) — price forecasting and stock-up advice
- [personal-inflation-index](features/personal-inflation-index.md) — price history from receipt
  lines, canonical product names, the Laspeyres index

### Budgets
- [budgets](features/budgets.md) — periods, the financial month, split-aware progress, the
  projection, threshold pushes

### Pricing and revenue
- [subscription-pricing](features/subscription-pricing.md) — where prices live, displayed vs
  charged, and how to change a live Stripe price
- [admin-revenue-metrics](features/admin-revenue-metrics.md) — investor metrics, acquisition, and
  keeping admin-granted tiers out of revenue

### Shared accounts
- [purchase-requests](features/purchase-requests.md) — proposing a purchase, approval rules, voting
  from the app and the bots, planned expenses
- [family-feed](features/family-feed.md) — the activity feed, grouping, live request status,
  reactions, retention
- [invite-by-search](features/invite-by-search.md) — inviting a registered user by push, and the
  three checks `respondToInvitation` must make

### Recurring charges
- [subscription-manager](features/subscription-manager.md) — tracking the user's own subscriptions,
  renewal reminders, auto-booked renewals (not Stripe)

### Trips
- [trip-wallet](features/trip-wallet.md) — the trip account type, multi-way splitting, settle-up

### Instrumentation
- [web-telemetry](features/web-telemetry.md) — first-party product analytics for the web build only

### Categories
- [category-id-resolution](features/category-id-resolution.md) — how a category id is resolved
  between phone and server, and the five bugs that came from getting it wrong
- [default-category-seeding](features/default-category-seeding.md) — every new account (not just a
  user's first) gets the localized default category set; `investment` accounts don't

## Health

[`wiki-health-trends.md`](wiki-health-trends.md) — appended by the `/wiki-health-scan` command.
Do not edit by hand.
