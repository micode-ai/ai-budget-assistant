---
agent: aba-mobile-engineer
title: 'Update stale repository count and list (12 → 17)'
status: proposed
conflict: false
created_at: 2026-05-11
---

## What's wrong

The agent file states "12 repositories in `src/db/*Repository.ts`" and CLAUDE.md lists only 10 by name (`account`, `category`, `currencyExchange`, `expense`, `expenseItem`, `income`, `project`, `split`, `tag`, `wallet`). A glob of `apps/mobile/src/db/*Repository.ts` reveals 17 files. The 7 missing entries are: `accountTransferRepository`, `budgetCategoryRepository`, `budgetRepository`, `encryptionRepository`, `gamificationRepository`, `investmentRepository`, `syncMetadataRepository`.

## Proposed change

- In the "Repositories" section of `.claude/agents/aba-mobile-engineer.md`, change "12 repositories" to "17 repositories".
- Add a bulleted list of all 17 repo names so future agents know the full surface area.
- Note which new repos (budget, investment, gamification) are associated with the offline-first sync pattern vs. those that are read-only caches (e.g., `syncMetadataRepository`).
- Update the matching count in CLAUDE.md under the Mobile section from "12 repositories" to "17 repositories" and expand the name list.

## Rationale

An agent tasked with a feature touching investments, budgets, or gamification will not know that dedicated repos already exist, risking duplicate code or bypassing the canonical repository layer. The stale count also erodes confidence in the file's accuracy overall.
