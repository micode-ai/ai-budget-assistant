// Jest setup for the mobile package.
//
// Why this exists: `src/db/client.native.ts` opens the SQLite database at
// MODULE SCOPE (`SQLite.openDatabaseSync('budget.db')`). Any suite that
// transitively imports it — which includes `@/theme` and most stores — used to
// blow up at import time and report "Tests: 0 total". Several suites sat dark
// for months, because mobile Jest was not run in CI at all.
//
// The mock boundary is `expo-sqlite`, deliberately NOT `client.native` itself:
// mocking the driver keeps the real application module graph loading, so tests
// still exercise real app code instead of a stub of it.
//
// Semantics mirror `client.web.ts`, the platform variant that already runs
// without a real database: an empty, non-persistent store. `getAllSync`
// therefore returns [] — exactly what a freshly created database would return
// — so a test that unintentionally reaches the data layer gets an empty result
// rather than a confusing "undefined is not a function".
//
// A test that needs real rows should mock its repository, not this driver.
//
// The three methods below are the entire surface `client.native.ts` uses:
// `execSync` (DDL and migrations), `getAllSync` (every `executeSql` call), and
// `withTransactionAsync` (every `withTransaction` call). If that file starts
// using another driver method, add it here — an omission shows up as a
// TypeError inside the suite, not as a crash at import.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    getAllSync: () => [],
    withTransactionAsync: async (task) => {
      await task();
    },
  }),
}));
