# Wiki Index

Domain-by-domain reference for the AI Budget Assistant monorepo. One page per coherent unit — start here to find the right file to read or edit.

## Apps

| Domain | Summary |
|---|---|
| [api](api.md) | NestJS 10 REST API — 30 modules, Prisma/PostgreSQL, JWT + account-scoped auth |
| [mobile-app](mobile-app.md) | Expo 54 / React Native offline-first app — Zustand stores, SQLite/Drizzle, 8-locale i18n |
| [admin-dashboard](admin-dashboard.md) | Next.js 16 operator dashboard — user mgmt, AI usage, comms, app-version releases |

## Packages

| Domain | Summary |
|---|---|
| [shared-types](shared-types.md) | TypeScript entity interfaces and DTOs shared between API and mobile |
| [shared-utils](shared-utils.md) | Zod validation schemas, formatting helpers, and shared constants |

## Cross-cutting Features

| Domain | Summary |
|---|---|
| [auth](auth.md) | JWT lifecycle, account context injection, password reset, mobile auto-refresh |
| [ai-features](ai-features.md) | GPT-4 chat, 7 function-calling actions, voice/OCR, usage metering |
| [offline-sync](offline-sync.md) | SQLite write-first, `syncQueue` pattern, background API sync |
| [subscriptions](subscriptions.md) | Stripe-backed Free/Pro/Business tiers, paywall, webhook lifecycle |
| [telegram-bot](telegram-bot.md) | Telegraf bot — text/voice/photo commands, account linking, 8-locale i18n |
| [whatsapp-bot](whatsapp-bot.md) | WhatsApp Cloud API bot — webhook + HMAC, Redis state, mirrors Telegram features, Meta setup runbook |
| [analytics-insights](analytics-insights.md) | Server aggregations, client-side hooks, charts, calendar, scenario simulator |
