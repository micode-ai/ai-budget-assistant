# Self-Study Note: aba-architect

**Date:** 2026-05-11  
**Agent file:** `.claude/agents/aba-architect.md`

## Role

Design cross-cutting features across shared-types → API → mobile (and sometimes admin) before any implementation begins — producing a written plan (data model, API surface, mobile flow, dependency order, risks) without touching production source files.

## Watchlist

Things to verify when this agent is invoked in this repo:

1. **Account-scoping on every new entity** — nearly all data in this codebase is scoped by `accountId`. Flag any new entity that lacks an `accountId` field and confirm it's intentional.
2. **Sync identity for mobile-mirrored data** — the codebase uses a `localId` ↔ `serverId` pattern for offline-first sync. Check whether a new entity needs this split and if so how the `syncQueue` table is involved.
3. **Module count drift** — CLAUDE.md lists 29 API modules but the repo currently has 30 (`health` is missing from CLAUDE.md's list). Before designing new modules, verify the real current list with `apps/api/src/modules/**/*.module.ts`.
4. **Design doc naming** — check `docs/superpowers/specs/` for existing docs on the same topic before starting; 9 past specs already exist and may contain relevant decisions.
5. **i18n key explosion** — the codebase has 8 locale files. Any new UI surface the design touches must budget for 8× the i18n string count; flag this in Risks.

## Clarifying question

Before designing any non-trivial feature: **Is this a Pro/paid feature or available on the free tier?** — the answer determines whether a paywall guard, subscription check, or `SubscriptionTier` field must appear in the data model and API guards.

## Agent file issues

- **`Write` tool is unrestricted by tooling** — the agent has full `Write` access but relies solely on instructions ("You do NOT modify production source files"). A typo or misread path could create or overwrite a production file. The constraint has no tooling enforcement.
- **Module count in CLAUDE.md is stale** — the agent instructs skimming CLAUDE.md for module context, but CLAUDE.md lists 29 modules while the codebase has 30 (the `health` module is unlisted). An architect relying on CLAUDE.md alone would miss it.
- **No mention of `finish-aba-task` skill** — the project requires creating an ABA-{N} GitHub issue and updating CLAUDE.md + user_docs after every task. The architect produces a design doc (not code), but whoever triggers it may expect the same completion ritual; the agent is silent on this.
- **`docs/superpowers/specs/` is assumed to exist** — the agent writes output there without a guard for the case where the directory is missing. In practice it does exist (9 docs present), but a note about `mkdir -p` fallback would be safer.
- **No guidance on spec versioning** — if a feature is redesigned, the naming convention (`YYYY-MM-DD-<topic>-design.md`) produces a new file rather than updating the old one. Multiple stale specs for the same topic will accumulate without a deprecation convention.
