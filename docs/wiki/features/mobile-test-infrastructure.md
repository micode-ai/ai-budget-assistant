# Mobile test infrastructure

*Hub: [mobile-app](../mobile-app.md)*

## What this is

How the Expo app's Jest suite is wired, and the two constraints that shape every test written
against it: nothing renders a component, and module-scope side effects leak across test files.

## Entry points

- `apps/mobile/package.json` — the `jest` block (`preset: jest-expo`, `setupFiles`,
  `setupFilesAfterEnv`)
- `apps/mobile/jest.setup.js` — runs **before** the test framework; mocks `expo-sqlite`
- `apps/mobile/jest.setup.after.js` — runs **after** it; per-file teardown
- CI runs `npx turbo test lint typecheck --filter=@budget/mobile`

## Key concepts

**The SQLite mock boundary is `expo-sqlite`, deliberately not `client.native.ts`.**
`src/db/client.native.ts` opens the database at module scope, so any suite that transitively
imports it — which includes `@/theme` and most stores — used to blow up at import time and report
"Tests: 0 total". Mocking the driver instead keeps the real application module graph loading, so
tests still exercise real app code rather than a stub of it. Semantics mirror `client.web.ts`:
`getAllSync` returns `[]`, which is what a freshly created database would return.

**A suite that needs real rows mocks its repository, not the driver.**

**Nothing renders a component.** There is no `react-test-renderer` or
`@testing-library/react-native` dependency. Anything that could be numerically wrong therefore
lives in a pure module the test can call directly — `desktopTable.ts`, `itemShares.ts`,
`budget-projection.ts`, `receipt-check.util.ts` — while layout, focus traps and colour contrast
are verified by hand. When a feature's correctness is trapped inside a component, extract the
arithmetic first; that is why so many `src/features/**` modules exist.

**`setupFiles` runs before the test framework, `setupFilesAfterEnv` after it.** `afterAll` does
not exist in the former. The `jest-expo` preset leaves `setupFilesAfterEnv` empty, so the project
owns it outright.

## Invariants

**Clear module-scope timers at the file boundary, not per suite.** `expenseStore.ts` registers a
module-scope `useExpenseStore.subscribe` that debounces a widget refresh behind a 1000 ms
`setTimeout` parked on `globalThis.__widgetRefreshTimer`, whose callback `require`s
`@/services/widgetData` **lazily**. Every suite that writes `expenses` schedules one, and most
suites finish in well under a second.

Jest resets the module registry between FILES but not the worker's timers. So the timer fires
while the NEXT suite is running, the lazy require resolves against a registry where that module is
neither mocked nor loadable, and the resulting `TypeError: refreshWidgetData is not a function` is
charged to whichever suite happened to be running. That is why it read as flakiness and kept
changing victims — `crypto.test.ts` in CI, `restoreCredential.test.ts` locally. The failing suite
is never the one at fault.

`jest.setup.after.js` clears the pending timer once per file. Do not solve this by adding
`jest.mock('@/services/widgetData')` to a suite: that only protects the suite that remembers it,
never the suite the timer actually lands in. A suite that wants to assert the debounce should take
fake timers and drive it deliberately.

**Reproduce a suspected cross-file leak with `--runInBand` and two named files**, in the order CI
ran them. A leak that looks random under parallel workers is usually deterministic that way — the
timer above reproduces every time with `jest --runInBand categoryStoreDivergedRecovery.test.ts
crypto.test.ts`.

**A mock must expose the whole shape the code reads, not just the method under test.** Several
`useCategoryStore` mocks exposed only `getCategoryById`, putting the store in a state it can never
really be in; when the filter started reading `isInitialized` and `categories` too, those suites
failed for a reason that had nothing to do with the change.

**A jest mock factory may not reference an out-of-scope variable unless its name starts with
`mock`.** An in-memory table shared between the factory and the test body must be named
`mockTable`, not `table`, or the suite fails to run at all with `Invalid variable access`.

## Known gaps

- The per-file `jest.mock('@/services/widgetData')` calls added before the teardown existed are now
  redundant but harmless; left in place.
- The production debounce is unchanged. A module-scope subscribe that schedules a real timer is
  awkward to test around, but changing it is a behaviour change, not a test fix.

## History

- **ABA-577** — the widget-refresh timer leaked across files and failed CI on an unrelated suite.
- The `expo-sqlite` mock predates it: several suites sat dark for months because mobile Jest was
  not run in CI at all.
