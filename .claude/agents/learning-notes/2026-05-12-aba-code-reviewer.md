---
name: 2026-05-12 aba-code-reviewer learning note
description: Study of the aba-code-reviewer agent — what it checks, gaps, and evolution proposals
type: learning-note
---

## Role

Structured code reviewer that audits AI Budget Assistant changes against project-specific patterns (account scoping, auth guards, i18n completeness, offline-first SQLite, shared-types sync) and outputs a severity-bucketed report without rewriting code.

## Watchlist

For a typical feature PR on this repo, these are the highest-leverage checks:

1. **i18n coverage** — any new `t('...')` key must appear in all 8 locale files (`en de es fr pl ru ua be`). Grep the key across `apps/mobile/src/i18n/locales/` to confirm. Missing keys are silent crashes at runtime.
2. **Account scoping leak** — every new Prisma query in a service should filter by `accountId`. Grep for the new model name + `findMany`/`findFirst`/`findUnique` and check each call site.
3. **Guard pattern on new controllers** — `@UseGuards(JwtAuthGuard, AccountContextGuard)` for regular routes; `@UseGuards(JwtAuthGuard, AdminGuard)` for admin routes. A new controller missing guards entirely is a security hole.
4. **Offline-first write path** — new mobile write actions should write to SQLite first and push to `syncQueue`, not call the API directly. Check store action implementations.
5. **secureStorage over AsyncStorage** — `src/services/secureStorage.native.ts` / `secureStorage.web.ts` is the project standard; direct `AsyncStorage` imports in screens or stores are a bug (recent `change-email` fix is a concrete example).

## Clarifying question

Before reviewing a non-trivial diff: "Is this a regular user-facing feature, an admin-only endpoint, or a cross-cutting change that spans both — so I know which guard pattern and scoping rules apply?"

## Agent file issues

- **Admin routes treated as missing guard** — the agent states "every controller has `@UseGuards(JwtAuthGuard, AccountContextGuard)` unless it's an explicit public endpoint" but admin routes intentionally use `@UseGuards(JwtAuthGuard, AdminGuard)` (no `AccountContextGuard`). A reviewer following the current wording would incorrectly flag valid admin controllers as critical findings. Needs an explicit carve-out. *(Evolution proposal written.)*

- **No secureStorage check** — the mobile section checks API client, i18n, types, offline-first, and orientation, but omits the `secureStorage` vs `AsyncStorage` pattern. This has burned the project at least once (commit `886f7aa`). *(Evolution proposal written.)*

- **No Paywall/subscription gate check** — `src/components/Paywall.tsx` exists and premium features should be gated with it, but the agent has no checklist item for this. New pro/business-only screens added without a Paywall wrapper are a silent regression. *(Evolution proposal written.)*
