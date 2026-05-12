# Self-Study: aba-mobile-engineer (2026-05-11)

## Role

Owns all Expo/React Native code under `apps/mobile/` — screens, Zustand stores, SQLite repositories, API client methods, and i18n — with a hard boundary against touching `apps/api/`, `apps/admin/`, or `packages/`.

## Watchlist

1. **Store count drift** — agent says 22 stores; `apps/mobile/src/stores/` currently has 23 (`authStore` is present). Any task that adds a store should update the count in the agent file.
2. **Repository count/list drift** — agent says 12 repositories; there are now 17: `accountRepository`, `accountTransferRepository`, `budgetCategoryRepository`, `budgetRepository`, `categoryRepository`, `encryptionRepository`, `expenseItemRepository`, `gamificationRepository`, `incomeRepository`, `investmentRepository`, `projectRepository`, `splitRepository`, `syncMetadataRepository`, `tagRepository`, `walletRepository`, `currencyExchangeRepository`, `expenseRepository`. Several new repos (budget, investment, gamification, encryption, accountTransfer, budgetCategory, syncMetadata) are missing from the agent's awareness.
3. **Undocumented `src/features/` modules** — the agent's scope lists `src/features/` generically but misses: `useBiometric` (native/web split), `useVoiceInput`, `useReceiptScanner`, `useChat`. Any agent touching the chat or voice/OCR flow may not apply the right patterns.
4. **finish-aba-task skill not mentioned** — CLAUDE.md mandates creating an ABA-{N} GitHub issue and updating CLAUDE.md + user_docs after every task. The agent file has no reference to this required closure step.
5. **Offline-first scope gap** — the mandatory offline-first pattern is documented for expenses and incomes, but the newer repos (investments, debts, gamification) may or may not follow it. Any task touching those domains should verify their sync queue usage before assuming the pattern is in place.

## Clarifying question

Before making non-trivial changes: does the feature being added require a new SQLite repository, or can it read from an existing one — and if new, has the db-engineer already updated the Drizzle schema?

## Agent file issues

- **Store count is stale**: file says "22 Zustand stores" but there are 23 (`authStore` was always there; count was wrong or a store was added without bumping the number).
- **Repository list is stale**: file says "12 repositories" and names only 10; actual count is 17 with 7 additional repos (`accountTransferRepository`, `budgetCategoryRepository`, `budgetRepository`, `encryptionRepository`, `gamificationRepository`, `investmentRepository`, `syncMetadataRepository`).
- **Missing `src/features/` detail**: biometric auth, voice input, receipt scanner, and chat feature modules are not documented, leaving a gap when tasks touch those areas.
- **No mention of `finish-aba-task` skill**: the workflow section ends at typecheck + i18n verification, but the project-wide rule requires creating a GitHub issue and updating docs as a closing step.
