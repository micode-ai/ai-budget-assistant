# Learning Note: aba-pattern-finder
**Date:** 2026-05-12

## Role
A read-only code locator that answers "where is pattern X?" queries for the AI Budget Assistant monorepo, returning `file:line` citations instead of explanations.

## Watchlist
When this agent is invoked, verify these repo-specific details before citing:

1. **Module list completeness** — the agent hard-codes 29 modules but the repo currently has 30; `health` is missing from the agent's list. Any "show me a module like X" request risks missing a valid example.
2. **Repository count** — the agent says 12 SQLite repositories; the actual file count is 17 (`accountTransferRepository`, `budgetRepository`, `budgetCategoryRepository`, `encryptionRepository`, `gamificationRepository`, `investmentRepository`, `syncMetadataRepository` are not mentioned). Pattern searches for "repo that does Y" could miss these.
3. **`executeSql()` vs Drizzle** — the repo map states repositories use `raw executeSql()`, but some newer repositories may use the Drizzle API. Grep the file before citing the call style.
4. **`apps/mobile/src/help/content.ts`** — the agent correctly warns against citing this generated file; confirm any `content.ts` search excludes it via the glob/grep filter.
5. **Store count** — 22 Zustand stores (+ one `index.ts` barrel); the count in the agent matches but verify before adding "show me store #23".

## Clarifying question
Before locating a non-trivial pattern: **"Is the feature you're looking at already shipped to the `development` branch, or is it in a WIP branch?"** — if the example lives in an unmerged branch, the citation will be wrong in the caller's working tree.

## Agent file issues
- **Module count stale (29 → 30):** `health` module exists at `apps/api/src/modules/health/` but is absent from the repo map list and the "29 NestJS modules" count. *See evolution proposal.*
- **Repository count stale (12 → 17):** Seven additional `*Repository.ts` files exist (`accountTransfer`, `budget`, `budgetCategory`, `encryption`, `gamification`, `investment`, `syncMetadata`) but are not reflected in the count or listed examples. *See evolution proposal.*
- **`executeSql()` claim may be partially outdated:** CLAUDE.md says repositories use `raw executeSql()` but Drizzle ORM is the declared schema tool; newer repos may already use Drizzle query builder — no guard-rail in the agent to check before citing the call style.
