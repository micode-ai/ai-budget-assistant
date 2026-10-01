# Scenario simulator and saved scenarios

*Hub: [analytics-insights](../analytics-insights.md)*

## What this is

A "what if" screen: adjust spending per category, income, and extra incomes, and see the projected
savings over 3, 6 or 12 months. Scenarios can be saved, reloaded and shared as text. Everything is
device-local — there is no API endpoint.

## Entry points

- `apps/mobile/app/scenario-simulator.tsx` — the screen and the text share (`Share.share`)
- `apps/mobile/src/features/scenario/useScenarioProjection.ts`, `useScenarioChartData.ts` — the
  pure projection over the expense and income stores
- `apps/mobile/src/components/scenario/ScenarioManager.tsx` — save modal and load sheet
- `apps/mobile/src/stores/scenarioStore.ts` — MMKV id `scenario-storage`, one key per
  `saved_scenarios:{userId}:{accountId}`

## Key concepts

**What a saved scenario is.** `SavedScenario` = `id`, `name`, `expenseAdj` and `incomeAdj` (keyed
records of adjustments), `extraIncomes`, `horizon` (3 | 6 | 12), `createdAt`. The list is stored as
one JSON string and loaded newest first.

**The scope.** The visible list belongs to one user and one account. `ScenarioManager` calls
`setScope(userId, accountId)` from an effect, which loads that scope's key; `logoutAction` calls
`reset()`, which empties the in-memory list and leaves the persisted rows under their own key.

**The tier limit.** `saveScenario(name, snapshot, isPro)` returns `'ok'`, `'limit_reached'`, or
`'no_scope'` when no scope is set; `canSave(isPro)` answers the same question up front (always false
without a scope). Free users keep five scenarios; Pro and Business are unlimited. `ScenarioManager` reads `isPro` from `subscriptionStore`.

## Invariants

**Saved scenarios are scoped to user and account, and nothing is saved without a scope.**
Adjustments are keyed by one account's category ids, so a scenario loaded under another account or
another user points at ids that do not exist there. Before scoping, the single unscoped key loaded
for whoever signed in next (ABA-626).

**Pre-scoping scenarios go to the first scope opened on the device, then the unscoped key is
deleted.** The old rows carry no owner; the first scope is almost always the person who saved them,
and deleting them outright would throw away a user's work. They are copied only into an empty scoped
key (ABA-626).

## Known gaps

- The free limit is enforced on the device only.

## History

Introduced with the scenario simulator; persistence and the free-tier limit added later.
