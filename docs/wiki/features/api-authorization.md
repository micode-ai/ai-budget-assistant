# API authorization rules

## What this is
The rules every authenticated API route follows to keep one account's data away from another account, and away
from a viewer's writes. Most of them are enforced by guards. This page collects the ways a route can slip past
those guards, each found in a real defect.

## Entry points
- `apps/api/src/common/middleware/account-context.middleware.ts` — `AccountContextGuard`. Reads `X-Account-Id`
  (or falls back to the user's default account), checks membership, and sets `req.accountId`/`req.accountRole`.
- `apps/api/src/modules/accounts/guards/account-role.guard.ts` — `AccountRoleGuard` + `@RequireRole`, and the
  zero-dependency `ViewerBlockGuard`. Both read `req.accountId`/`req.accountRole`.
- `apps/api/src/modules/encryption/encryption.service.ts` — `assertAccountAccess`, the path-account check.
- `apps/api/src/modules/users/users.controller.ts` — `pickProfileFields`, the `PATCH /users/me` whitelist.

## Key concepts
- **The guards check the HEADER account, never a path parameter.** A route whose service acts on
  `:accountId` from the URL is checked against whatever account the header names. That can be a different
  account the caller owns.
- **An inline-typed `@Body()` is not validated.** The global `ValidationPipe` (`whitelist`,
  `forbidNonWhitelisted`) works only on DTO classes. `@Body() body: { name?: string }` has the metatype `Object`,
  so every key the client sends reaches the handler.
- **The viewer block is per route.** No class-level default exists. A mutating route on account data must carry
  `new ViewerBlockGuard()` or `@RequireRole('editor')`.

## Invariants
- A route that acts on an account named in its PATH checks the caller's membership (and role) on THAT account.
  The encryption routes do this through `EncryptionService.assertAccountAccess`. Do not "fix" such a route by
  requiring the header to equal the path: the app calls the encryption routes for accounts other than the current
  one without pinning the header.
- Never spread an inline-typed body into a Prisma `data`. Pick the allowed fields explicitly, or use a DTO class.
  The `PATCH /users/me` spread once let any user set `isVerified`, `email`, `isActive` and `defaultAccountId` on
  themselves (ABA-807).
- A reference the client sends — a tag, project or category id — is resolved INSIDE the account before it is
  written, and the resolved primary key is what gets linked. A bare `findUnique({ id })` once let an expense or
  income carry another account's tag or project, and a split or subscription another account's category, with
  its name returned in the response ([ABA-809](https://github.com/micode-ai/ai-budget-assistant/issues/847)). Categories go through `resolveExpenseCategoryId`.
- An unauthenticated route never gets the 50 MB body limit: sign-in and the webhooks are capped at 1 MB by
  `common/http/small-body-limit.ts`, mounted before the global parser ([ABA-809](https://github.com/micode-ai/ai-budget-assistant/issues/847)).
- A webhook signature check with an EMPTY secret accepts nothing — an HMAC keyed by `''` is computable by anyone.
- `user.defaultAccountId` is only trustworthy because nothing but account creation and sign-up writes it. A cron
  that reads data through it does no membership check of its own (the leaflet promo push, the monthly Wrapped).
- Every import write route — bank and Wise commit, saved mappings, batch rollback — blocks viewers. A viewer may
  preview.
- A non-member and a missing account get the same 403 from the path check, so it never confirms that an account
  exists.

## Known gaps
Open findings from the 2026-11-16 security review:
- Dependency upgrades (Next.js, NestJS 11, nodemailer, the MCP SDK) and container hardening (non-root, pinned images).
- Register's 409 and login's Google-only message reveal that an address is registered.

## History
- ABA-155 added `ViewerBlockGuard`.
- [ABA-809](https://github.com/micode-ai/ai-budget-assistant/issues/847) closed the review's medium findings: token revocation, foreign tag/project/category references, webhooks with an unset secret, the pre-authentication body limit, Sentry bodies.
- [ABA-808](https://github.com/micode-ai/ai-budget-assistant/issues/846) closed three of the review's findings: brute-forceable bot link codes, the Google auto-link pre-hijack, and the missing login limit and in-memory auth limits — see [auth](../auth.md).
- [ABA-807](https://github.com/micode-ai/ai-budget-assistant/issues/845) fixed three defects:
  - the encryption routes acted on the path account while checking the header one;
  - `PATCH /users/me` mass assignment;
  - viewers could write through imports.
