# Security Audit — AI Budget Assistant

**Date**: 2026-05-27  
**Scope**: Full-repository audit — `apps/api`, `apps/mobile`, `apps/admin`  
**Auditor**: aba-security agent  

## Summary

The codebase has a generally sound foundation: guards are consistently applied on controllers, Prisma queries scope by `accountId` in the major data-access paths, the WhatsApp HMAC verification and Stripe webhook verification are correctly implemented, and JWT tokens are stored in `expo-secure-store` on native.

**11 findings total: 3 Critical, 3 High, 3 Medium, 2 Informational.**

---

## Critical (block merge / hotfix required)

### C1 — Category UUID accepted without account ownership check (IDOR)
**File**: `apps/api/src/modules/expenses/expenses.service.ts:43–44`

`resolveCategoryId` short-circuits on any valid UUID with no ownership check. An authenticated user can supply a category UUID from another account — the `Expense.categoryId` FK will be set to a foreign-account category, leaking its existence and silently associating the record across account boundaries. This path is exercised on every `POST /expenses`, `PATCH /expenses/:id`, and every sync push. The name-based fallback (lines 47–50) also has no `accountId` filter.

**Fix**: Add `accountId` to every `findFirst` inside `resolveCategoryId`. For the UUID path, validate membership via `findUnique({ where: { id: categoryId, accountId } })` before trusting the id.

---

### C2 — Stripe webhook accepts empty secret (silent downgrade to unauthenticated)
**File**: `apps/api/src/modules/subscriptions/subscriptions.service.ts:431–435`

```ts
const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret || '');
```

If `STRIPE_WEBHOOK_SECRET` is missing from the environment, `webhookSecret || ''` passes an empty string to `constructEvent`. The Stripe SDK with an empty secret accepts any `stripe-signature` header value whose timestamp is not too far in the past — an attacker can craft a fake event (e.g., `customer.subscription.updated` with `tier: 'business'`) and post it to `POST /webhooks/stripe`.

**Fix**: Fail-fast at startup if `STRIPE_WEBHOOK_SECRET` is not set (throw in the constructor, do not fall back to `''`). Add `STRIPE_WEBHOOK_SECRET` to `.env.example`.

---

### C3 — Telegram webhook has no signature verification
**File**: `apps/api/src/modules/telegram/telegram-bot.controller.ts:9–13`

`POST /telegram/webhook` forwards any HTTP request directly to `bot.handleUpdate(req.body)` with no token or HMAC check. An attacker can POST crafted Telegram update objects — including `/link <code>` payloads with an arbitrary `from.id` — to link or unlink any user's Telegram account. Telegraf supports a `secretToken` parameter to `setWebhook` / `X-Telegram-Bot-Api-Secret-Token` header verification that is not implemented.

**Fix**: Configure `secretToken` on `setWebhook`, then verify `req.headers['x-telegram-bot-api-secret-token']` against a stored secret before dispatching.

---

## High (fix before next release)

### H1 — Viewer-role user can execute AI write actions
**File**: `apps/api/src/modules/ai/services/chat.service.ts:218–287`

`POST /ai/chat/confirm` is guarded only by `JwtAuthGuard + AccountContextGuard` with no role check. In a shared conversation, a viewer can initiate write-triggering messages and confirm them — bypassing the role model. Root cause: no controller in `expenses`, `incomes`, `budgets`, `tags`, `projects`, `debts`, or `wallet` applies `AccountRoleGuard` on write methods. `categories.controller.ts:30` guards only `DELETE`, not `POST`/`PATCH`.

**Fix**: Apply `@UseGuards(AccountRoleGuard) @RequireRole('editor')` to all write endpoints (POST/PATCH/DELETE) across feature controllers, and add the same check in `confirmAction`.

---

### H2 — CORS wildcard in production
**File**: `apps/api/src/main.ts:29`

```ts
origin: process.env.CORS_ORIGIN || '*',
```

Without `CORS_ORIGIN` set (absent from `.env.example`), the API accepts cross-origin requests from any origin with `credentials: true`. Any website can make credentialed requests to the API from a victim's browser. The admin dashboard's localStorage-stored Bearer tokens are particularly exposed.

**Fix**: Set `CORS_ORIGIN` explicitly for production (e.g., `https://app.ai-budget.pl,https://admin.ai-budget.pl`). Add the variable to `.env.example`. Default to a restrictive list, not `*`.

---

### H3 — `verifyEmail` has no rate limit
**File**: `apps/api/src/modules/auth/auth.service.ts:285–328`

`forgotPassword` and `resetPassword` are rate-limited but `verifyEmail` has no `checkRateLimit` call. An attacker can brute-force the 6-digit (1-in-1,000,000) email verification code with no throttling. Additionally, all rate-limit maps are in-memory and reset on process restart.

**Fix**: Add `checkRateLimit` to `verifyEmail`. Consider IP-keyed limiting or Redis-backed counters for restart-resilience.

---

## Medium (defense-in-depth)

### M1 — Full request body including PII logged at DEBUG level
**File**: `apps/api/src/modules/expenses/expenses.controller.ts:36–37,68–69`

```ts
this.logger.debug(`[CREATE] raw body: ${JSON.stringify(req.body)}`);
this.logger.debug(`[CREATE] dto: ${JSON.stringify(dto)}`);
```

These include `receiptImageBase64`, `description`, `notes`, `merchant`, `amount`, `encryptedPayload`. When `LOG_LEVEL=debug` is active during incident investigation, full financial transaction payloads are emitted to log sinks.

**Fix**: Remove these `logger.debug` lines or replace with non-PII summaries (e.g., `localId`, `amount`, `currencyCode` only).

---

### M2 — Encryption recovery endpoint not rate-limited
**File**: `apps/api/src/modules/encryption/encryption.controller.ts:139–141`

`POST /encryption/recovery/recover` is correctly JWT-guarded but has no rate limit on recovery attempts. The bcrypt comparison is CPU-expensive; without rate limiting, repeated recovery requests against a known email can be used as a targeted DoS.

**Fix**: Add in-memory or Redis-backed rate limiting (e.g., 5 attempts per email per 15 minutes).

---

### M3 — Category name lookup has no account scope
**File**: `apps/api/src/modules/expenses/expenses.service.ts:47–50`

In `resolveCategoryId`, the "try exact name match" path queries `category` with only a name filter, no `accountId`. A user typing a category name that exists in another account's namespace will have their expense linked to that foreign-account category (data integrity issue + side-channel).

**Fix**: Add `accountId` to this `findFirst` call.

---

## Informational

### I1 — Restore accepts client-supplied UUIDs
**File**: `apps/api/src/modules/backups/backups.service.ts:329–331`

When restoring a backup with `overwrite: false`, entities are created with the `id` field sourced from the backup JSON. Risk is low (`accountId` is always server-side), but predictable UUIDs could cause collision noise and error message leakage.

**Fix**: Generate fresh server-side UUIDs on restore, or validate that supplied ids don't already exist.

---

### I2 — `.env.example` missing several required variables

`JWT_REFRESH_SECRET`, `STRIPE_WEBHOOK_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAILS` are all referenced in production code but absent from `.env.example`. Operators deploying from the example will produce unsafe defaults (triggering C2 and H2 above).

**Fix**: Add all referenced env vars to `.env.example` with placeholder values and brief comments.

---

## Verified (no issues found)

- ✅ **WhatsApp webhook**: HMAC-SHA256 with `timingSafeEqual`, raw body via `req.rawBody`, 401 on mismatch
- ✅ **AccountContextGuard**: reads `accountId` from header, validates membership from DB, never from request body
- ✅ **JWT strategy**: fetches user from DB on every request, checks `isActive`, no default-secret fallback
- ✅ **AI confirm flow**: `pending_action` lookup scoped by `conversationId + accountId + senderUserId`; `accountId` in `executeAction` taken from stored `pendingData.accountId` (server-written), not request
- ✅ **WhatsApp bot**: unlinked numbers can only `link`; Redis idempotency keys and pending-action TTLs match docs
- ✅ **Telegram bot user resolution**: uses `ctx.from.id` (Telegram-assigned integer), not mutable username
- ✅ **Mobile secureStorage**: `authStore.ts` uses `secureStorage` for tokens and user profile; no raw `AsyncStorage` for sensitive data
- ✅ **Mobile SQLite repositories**: all `executeSql` calls use parameterized placeholders (`?`), no string concatenation
- ✅ **Wise CSV import dedup**: queries include `accountId` in both `externalRef` lookup and content-duplicate queries
- ✅ **Bank import batch rollback**: scoped by `{ id: batchId, accountId }`
- ✅ **Backup export/restore**: `accountId` and `userId` from `req` (guard-injected), never from JSON payload
- ✅ **Sentry**: only 5xx exceptions captured; user ID attached, not email/body; `instrument.ts` is first import in `main.ts`
- ✅ **Admin dashboard**: no `dangerouslySetInnerHTML`; `AdminController` uses `JwtAuthGuard + AdminGuard` at class level
- ✅ **AI write tools**: all 7 write tools route through `pending_action` → confirm flow; no synchronous write bypass
