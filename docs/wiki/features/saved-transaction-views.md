# Saved transaction views

*Hub: [mobile-app](../mobile-app.md) · sibling: [scenario-simulator](scenario-simulator.md)*

## What this is
Chips above the transaction list that re-apply a saved combination of the screen's filters in one tap. Device-local; phone and desktop web share one component.

## Entry points
- `apps/mobile/src/features/expenses/savedViews.ts` — pure model (capture, match, parse) and its test
- `apps/mobile/src/stores/savedViewStore.ts` — MMKV id `saved-view-storage`, key `saved_views:{userId}:{accountId}`
- `apps/mobile/src/components/expenses/SavedViewsBar.tsx` — the chips, inline save/rename, long-press menu
- Host wiring: `useExpensesScreenData` (`savedViewState`, `applySavedView`) for the phone, `ExpensesDesktop.tsx` for desktop

## Key concepts
A view stores kind (all/expenses/income), a RELATIVE period, search text, category ids and merchants. `custom` (a fixed month) is not captured: `period: null` means "leave the period alone". The phone has single-select categories, so it applies only the first one; desktop applies all. Free tier holds 5 views, Pro unlimited (same as scenarios).

## Invariants
- Never store fixed dates — "this month" must stay this month next month.
- Store resets on logout (`authSessionActions`); persisted rows stay under their own scoped key.
- A new filter on the screen must be added to `ScreenFilterState`/`SavedView` and `parseStoredViews`, or it is silently not saved.

## Known gaps
No amount-range or tag filter (they do not exist on the screen). Not synced across devices. Desktop shows the bar above the list rather than in a left rail.

## History
ABA-848.
