# Self-Study: aba-backend-engineer — 2026-05-12

## Role

Implements NestJS modules, controllers, services, guards, and DTOs inside `apps/api/src/` (everything except `apps/api/prisma/`), following the project's established patterns.

## Watchlist

1. **Account scoping in every Prisma query** — every `prisma.xxx.findMany()` / `findFirst()` / `update()` must include `where: { accountId }`. The single most exploitable bug class in this codebase.
2. **Guard order on controllers** — `JwtAuthGuard` must come before `AccountContextGuard`. Role guards (`AccountRoleGuard` with `@RequireRole`) are an additional layer on top, not replacements.
3. **AI module duplication risk** — the `ai/` directory already has categorization, embedding, OCR, goal-planner, project/split/tag suggestion services. Any new AI-adjacent feature should search here first before creating a parallel service.
4. **Subscription guards on resource-creating endpoints** — `modules/subscriptions/guards/` has `ai-usage.guard.ts`, `account-limit.guard.ts`, `subscription-tier.guard.ts`. Features with usage limits or tier gating should stack these guards, not re-invent the logic.
5. **Sentry init order in `main.ts`** — `import './instrument'` must remain the very first line; any new bootstrap wiring goes after it.

## Clarifying question

> Is this a new endpoint on an existing module, or a genuinely new domain (new module + DB table)? If new DB table, has `aba-db-engineer` already run the migration?

## Agent file issues

- **Guards location mismatch (structural)**: The scope section claims `apps/api/src/common/ — guards, middlewares, types`, but `JwtAuthGuard` lives in `modules/auth/guards/`, `AccountRoleGuard` in `modules/accounts/guards/`, and `AdminGuard` in `modules/admin/`. Only `AccountContextMiddleware` and `CacheService` are actually in `common/`. An agent following this literally would create guards in the wrong place and fail to find existing ones.

- **Stale module count**: "29 existing modules" is off by at least one — a `health/` module (`health.module.ts` + `health.controller.ts`) exists but is absent from both the agent file's count and CLAUDE.md's list. The real number is 30+ unique module directories.

- **AI module expanded scope not documented (structural)**: The agent's cross-cutting rules mention only the chat Q&A confirmation flow, but the `ai/` directory now contains embedding, OCR, whisper transcription, categorization, goal-planner, and project/split/tag suggestion services. Without knowing this, an agent could easily add duplicate capabilities.

- **Subscription guards undocumented (structural)**: `modules/subscriptions/guards/` has three ready-made guards (`ai-usage`, `account-limit`, `subscription-tier`). They're never mentioned in the agent file, so an agent implementing a gated feature might write its own limit-enforcement logic instead.
