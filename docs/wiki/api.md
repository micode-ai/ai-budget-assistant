# API (NestJS backend)

*Hub. Audited 2026-09-22 — see the note at the bottom.*

## What this is

The REST API, NestJS 10 + Prisma 5 on PostgreSQL + Redis. Single source of truth for all persisted
data; enforces business rules and access control; serves the mobile app, the web build and the admin
dashboard.

## Entry points

- `apps/api/src/main.ts` — bootstrap; imports `./instrument` (Sentry) **first**, before anything else
- `apps/api/src/app.module.ts` — the root module
- `apps/api/src/global-prefix-exclusions.ts` — every route that escapes the `/api/v1` prefix
- `apps/api/prisma/schema.prisma` — the authoritative schema
- `apps/api/src/common/types/index.ts` — `AuthenticatedRequest`
- `apps/api/src/common/middleware/account-context.middleware.ts` — despite the filename, a **guard**

## Feature pages

- [receipt-split](features/receipt-split.md) · [receipt-split-item-shares](features/receipt-split-item-shares.md)
- [receipt-category-split](features/receipt-category-split.md)
- [account-transfers](features/account-transfers.md) · [shopping-list](features/shopping-list.md)
- [ai-statement-import](features/ai-statement-import.md)
- [client-id-resolution](features/client-id-resolution.md) · [category-id-resolution](features/category-id-resolution.md)
- [categorize-uncategorized](features/categorize-uncategorized.md) — the read-only
  `POST /ai/categorize-uncategorized` batch classifier
- [merchant-category-rules](features/merchant-category-rules.md) — the learned per-account
  merchant → category table

## Key concepts

**Module structure.** `modules/<feature>/` with `module.ts`, `controller.ts`, `service.ts`,
`dto/index.ts`, `guards/`. The module list is the count — `CLAUDE.md` carries it, and this page
deliberately does not restate it as a numeral (it said 35 for four months while the real figure
reached 48, and `CLAUDE.md`'s own note records it being wrong at 44, 45 and 47 as well).

**Service signature.** `(accountId, userId, dto)`, and every Prisma query filters by `accountId`.

**The guard stack.** In the order they matter:

| Guard | Role |
|---|---|
| `JwtAuthGuard` | Authentication; the request carries `userId` afterwards |
| `AccountContextGuard` | Reads `X-Account-Id`, resolves membership, sets `accountId`, `accountRole` and `monthAnchorDay` |
| `ViewerBlockGuard` | **The write guard.** Zero-dependency, used as `@UseGuards(new ViewerBlockGuard())` on any method that mutates account-scoped data, without importing `AccountsModule` |
| `AccountRoleGuard` + `@RequireRole('owner'\|'editor')` | DI-based, for the narrower owner/editor cases |
| `SubscriptionTierGuard` + `@RequireTier` | Paid-tier gating |
| `TripArchivedGuard` | Blocks writes to an archived trip account |

**Health.** `GET /api/v1/health` runs `SELECT 1`. It is what Docker's `HEALTHCHECK` and the uptime
workflow watch — and therefore what they *cannot* see: a missing column makes real queries fail while
`SELECT 1` keeps the container green.

## Invariants

**`AccountContextGuard` is a guard, not middleware**, even though it lives in
`common/middleware/account-context.middleware.ts` and both this page and `CLAUDE.md` called it
middleware for months. There is no `AccountContextMiddleware` class anywhere in the repo. It is
`implements CanActivate`, and it is what sets `req.monthAnchorDay`.

**`ViewerBlockGuard` is the one to reach for on a write.** It is used by 20 controllers and was
entirely absent from this page, which described owner-only `AccountRoleGuard` as though it were the
write rule.

**Everything that escapes the `/api/v1` prefix is in one file.** Not just the bot webhooks:
`webhooks/stripe`, `telegram/webhook`, `whatsapp/webhook`, `slack/events`, `slack/interactivity`,
`slack/install`, `slack/oauth/callback`, and the whole guest subtree as a single wildcard `s/(.*)`.
Adding a route to an excluded controller without checking that file is how every scanned QR 404'd in
production — see [receipt-split](features/receipt-split.md).

**A `schema.prisma` field change must land with its migration in the same commit.** Nothing in the
pipeline catches a missing one: lint, typecheck, tests and the deploy all pass, `prisma generate`
happily builds a client that selects the new column, `prisma migrate deploy` has nothing to apply,
and the first query to touch it fails at runtime in production.

## Unauthenticated surface

Secured by signature verification or by an unguessable token, never by a session:

| Endpoint | How it is secured |
|---|---|
| `POST /webhooks/stripe` | Stripe signature |
| `POST /telegram/webhook` | Telegram's own secret path/token |
| `GET\|POST /whatsapp/webhook` | HMAC-SHA256 over the raw body, `WHATSAPP_APP_SECRET` |
| `POST /slack/events`, `/slack/interactivity` | `v0=` HMAC-SHA256, `SLACK_SIGNING_SECRET`, 5-min replay window |
| `GET /slack/install`, `/slack/oauth/callback` | Single-use CSRF state in Redis |
| `/s/**` (guest links) | A 128-bit token in the path, plus throttling |

`main.ts` registers `express.urlencoded({ verify })` alongside the JSON parser so `rawBody` exists
on the urlencoded Slack interactivity endpoint.

## Where to look first

Business logic → `modules/<feature>/`, but check this wiki's feature pages first. Data model →
`schema.prisma`. A route that 404s in production but works locally →
`global-prefix-exclusions.ts`.

## Audit note

Read against the code on 2026-09-22. Wrong: the module count and its list (35, actually 48 — now
deleted rather than updated); `AccountContextGuard` described as middleware, which is what the
filename suggests and the code contradicts; `ViewerBlockGuard` missing entirely although 20
controllers use it; and the prefix-exclusion list presented as "WhatsApp and Slack" when it also
covers Stripe, Telegram, two Slack OAuth routes and the entire guest subtree. NestJS 10 and Prisma 5
checked and correct.
