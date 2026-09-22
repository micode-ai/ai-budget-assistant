// Per-file teardown for the mobile package.
//
// Runs through `setupFilesAfterEnv`, i.e. after the test framework is
// installed, because `afterAll` does not exist yet in `jest.setup.js`
// (`setupFiles` runs before it).
//
// Why this exists: `expenseStore.ts` registers a module-scope
// `useExpenseStore.subscribe` that debounces a widget refresh behind a 1000 ms
// `setTimeout`, parked on `globalThis.__widgetRefreshTimer`, whose callback
// `require`s `@/services/widgetData` lazily. Every suite that writes `expenses`
// schedules one — and most suites finish in well under a second.
//
// Jest resets the module registry between FILES, but not the worker's timers.
// So a timer scheduled by a fast suite fires while the NEXT suite is running,
// and the lazy require resolves against a registry where that module is
// neither mocked nor loadable: `TypeError: refreshWidgetData is not a
// function`, charged to whichever innocent suite happened to be running at the
// time. That is why it read as flakiness and kept changing victims
// (`crypto.test.ts` in CI, `restoreCredential.test.ts` locally) — the failing
// suite was never the one at fault.
//
// Clearing the pending timer once per file kills the whole class, rather than
// asking every suite that touches expenses to remember to mock a module it
// does not use. A suite that wants to assert the debounce itself should take
// fake timers and drive it deliberately.
afterAll(() => {
  const timer = globalThis.__widgetRefreshTimer;
  if (timer !== undefined) {
    clearTimeout(timer);
    globalThis.__widgetRefreshTimer = undefined;
  }
});
