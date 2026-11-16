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
- `user.defaultAccountId` is only trustworthy because nothing but account creation and sign-up writes it. A cron
  that reads data through it does no membership check of its own (the leaflet promo push, the monthly Wrapped).
- Every import write route — bank and Wise commit, saved mappings, batch rollback — blocks viewers. A viewer may
  preview.
- A non-member and a missing account get the same 403 from the path check, so it never confirms that an account
  exists.

## Known gaps
Open findings from the 2026-11-16 security review, tracked as follow-ups to ABA-807:
- Bot link codes are 24-bit, looked up globally and not rate-limited.
- A Google auto-link of an unverified account keeps the attacker-set password.
- `POST /auth/login` has no server-side rate limit, and the other auth limits live in in-memory Maps.
- Expense and income writes accept a `tagIds`/`projectId`, and splits and user subscriptions a `categoryId`, from
  another account. A foreign UUID is required.
- Tokens are not revoked on password reset or e-mail change.

## History
- ABA-155 added `ViewerBlockGuard`.
- [ABA-807](https://github.com/micode-ai/ai-budget-assistant/issues/845) fixed three defects:
  - the encryption routes acted on the path account while checking the header one;
  - `PATCH /users/me` mass assignment;
  - viewers could write through imports.
