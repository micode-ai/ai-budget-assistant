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
- `apps/mobile/src/stores/scenarioStore.ts` — MMKV id `scenario-storage`

## Key concepts

**What a saved scenario is.** `SavedScenario` = `id`, `name`, `expenseAdj` and `incomeAdj` (keyed
records of adjustments), `extraIncomes`, `horizon` (3 | 6 | 12), `createdAt`. The list is stored as
one JSON string and loaded newest first.

**The tier limit.** `saveScenario(name, snapshot, isPro)` returns `'ok'` or `'limit_reached'`;
`canSave(isPro)` answers the same question up front. Free users keep five scenarios; Pro and
Business are unlimited. `ScenarioManager` reads `isPro` from `subscriptionStore`.

## Known gaps

- Saved scenarios are neither account- nor user-scoped: the MMKV store is never cleared on sign-out
  or account switch, so a scenario saved under one account loads under another, with adjustments
  keyed to ids that may not exist there.
- The free limit is enforced on the device only.

## History

Introduced with the scenario simulator; persistence and the free-tier limit added later.
