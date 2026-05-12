---
agent: aba-db-engineer
title: 'Update stale repository count in scope section'
status: proposed
conflict: false
created_at: 2026-05-12
---

## What's wrong

The agent's scope section at line 15 reads: "12 repositories in `src/db/*Repository.ts` use raw `executeSql()`."
A glob of `apps/mobile/src/db/*Repository.ts` returns 17 files:
`accountRepository`, `accountTransferRepository`, `budgetCategoryRepository`, `budgetRepository`,
`categoryRepository`, `encryptionRepository`, `expenseItemRepository`, `gamificationRepository`,
`incomeRepository`, `investmentRepository`, `projectRepository`, `splitRepository`,
`syncMetadataRepository`, `tagRepository`, `walletRepository`, `currencyExchangeRepository`,
`expenseRepository`.

## Proposed change

- Change the scope bullet from "12 repositories" to "17 repositories" (or drop the hard count and write "all `*Repository.ts` files").
- Optionally add the missing repo names (`accountTransfer`, `budget`, `budgetCategory`, `encryption`, `gamification`, `investment`, `syncMetadata`) to any inline list so the agent's stated scope stays accurate.
- Add a note that this count drifts as new repos are added — prefer a glob pattern reference over a literal count.

## Rationale

An agent instructed to "own 12 repositories" and discovering 17 may treat the extras as out-of-scope or fail to issue handoff notes for the new repos. Keeping the count current ensures the agent checks all repositories when scanning for residual usages during a field change.
