# API (NestJS Backend)

## What this is
The REST API backend, built with NestJS 10 + Prisma 5 on PostgreSQL + Redis. It is the single source of truth for all persisted data, enforces business rules and access control, and serves both the mobile app and the admin dashboard.

## Entry points
- `apps/api/src/main.ts` — bootstrap entry point; imports `./instrument` (Sentry) first before anything else
- `apps/api/src/app.module.ts` — root module that imports all 35 feature modules
- `apps/api/prisma/schema.prisma` — authoritative database schema
- `apps/api/src/common/types/index.ts` — `AuthenticatedRequest` type used across controllers

## Key concepts
- **Module structure** — each feature lives in `modules/<feature>/` with `module.ts`, `controller.ts`, `service.ts`, `dto/index.ts`, `guards/`
- **Auth** — JWT via `JwtAuthGuard`; request carries `userId` after guard runs
- **Account scoping** — `AccountContextGuard` middleware reads `X-Account-Id` header, resolves membership, injects `accountId` + `accountRole` into every request
- **Role-based access** — `AccountRoleGuard` + `@RequireRole('owner')` decorator restrict write operations to account owners
- **Service signature** — all service methods follow `(accountId, userId, dto)` parameter order; all Prisma queries filter by `accountId`
- **35 modules** — `accounts`, `account-transfers`, `admin`, `ai`, `analytics`, `app-versions`, `auth`, `backups`, `budgets`, `categories`, `currency-exchange`, `debts`, `encryption`, `expenses`, `gamification`, `health`, `import-bank`, `import-batches`, `import-wise`, `incomes`, `insights`, `investments`, `mail`, `notifications`, `projects`, `referrals`, `reports`, `slack`, `subscriptions`, `sync`, `tags`, `telegram`, `users`, `wallet`, `whatsapp`
- **Health** — `GET /api/v1/health` runs `SELECT 1` on Postgres; used by Docker `HEALTHCHECK` and uptime CI

## Cross-references
- Talks to: `mobile-app` via REST + JSON (auto-refreshed JWT, `X-Account-Id` header)
- Talks to: `admin-dashboard` via REST (Bearer token, admin-only endpoints)
- Uses: `shared-types` for entity interfaces and DTO shapes
- Uses: `shared-utils` for Zod validation schemas
- Owns: Prisma migrations in `apps/api/prisma/migrations/`

## Messaging bot webhooks
Both WhatsApp and Slack webhook endpoints are **excluded from the `/api/v1` prefix** in `main.ts` and are **unauthenticated by design** — secured solely by HMAC-SHA256 signature verification over the raw request body.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/whatsapp/webhook` | GET | WhatsApp webhook verification (returns challenge) |
| `/whatsapp/webhook` | POST | WhatsApp inbound events — HMAC-SHA256 via `WHATSAPP_APP_SECRET` |
| `/slack/events` | POST | Slack Events API — `v0=` HMAC-SHA256 via `SLACK_SIGNING_SECRET`, 5-min replay window |
| `/slack/interactivity` | POST | Slack Block Kit button callbacks — same signature scheme, urlencoded `payload` field |

`main.ts` registers `express.urlencoded({ verify })` in addition to the JSON body parser so that `rawBody` is captured on the urlencoded Slack interactivity endpoint for HMAC verification.

## Slack user link endpoints
These live on `UsersController` under `/api/v1/users/me/` and require `JwtAuthGuard`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users/me/slack-link-code` | POST | Generate a 6-char hex link code (expires in 10 min) |
| `/users/me/slack-link` | GET | Fetch current Slack link status (`linked`, `unlinked`) |
| `/users/me/slack-link` | DELETE | Unlink the Slack account |

## Cross-references
- See [`slack-bot`](slack-bot.md) for the full Slack module architecture
- See [`whatsapp-bot`](whatsapp-bot.md) for the WhatsApp module architecture

## Where to look first
Start at `apps/api/src/modules/<feature>/` for any business-logic change, and `apps/api/prisma/schema.prisma` for any data-model change.
