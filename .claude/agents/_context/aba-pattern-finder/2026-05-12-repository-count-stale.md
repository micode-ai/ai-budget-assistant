---
agent: aba-pattern-finder
title: 'Update SQLite repository count and list from 12 to 17'
status: applied
conflict: false
created_at: 2026-05-12
applied_at: 2026-05-22
orchestration_run: d1aae0d7-ae14-43b5-9a7e-25b1fdf7910c
---

## What's wrong
`.claude/agents/aba-pattern-finder.md` states "12 SQLite repositories using raw `executeSql()`" under the repo map. Actual glob of `apps/mobile/src/db/*Repository.ts` returns 17 files. The seven unlisted repositories are: `accountTransferRepository`, `budgetRepository`, `budgetCategoryRepository`, `encryptionRepository`, `gamificationRepository`, `investmentRepository`, `syncMetadataRepository`.

## Proposed change
- Update the count from `12` to `17` in the repo map line.
- List the full set of 17 repository file names (or at minimum note that the full list can be discovered via `Glob apps/mobile/src/db/*Repository.ts`).
- Add a caveat noting that newer repositories may use the Drizzle query builder rather than raw `executeSql()` — the agent should `Read` a repository before citing its call style.

## Rationale
Pattern searches like "show me a repo that handles X" currently skip 5+ relevant files. If a caller wants to find an example of, say, budget sync logic, `budgetRepository.ts` is invisible to the agent unless it happens to Glob for it independently. Fixing the count + adding the caveat prevents stale citations.
