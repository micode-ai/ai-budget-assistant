// Web-specific database implementation using in-memory storage
// expo-sqlite doesn't work on web, so we use a mock implementation

// Mock schema
export const schema = {};

// Mock drizzle instance that returns empty results
export const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve([]),
        limit: () => Promise.resolve([]),
        execute: () => Promise.resolve([]),
      }),
      orderBy: () => ({
        limit: () => Promise.resolve([]),
        execute: () => Promise.resolve([]),
      }),
      limit: () => Promise.resolve([]),
      execute: () => Promise.resolve([]),
    }),
  }),
  insert: () => ({
    values: () => ({
      returning: () => Promise.resolve([]),
      execute: () => Promise.resolve([]),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([]),
        execute: () => Promise.resolve([]),
      }),
    }),
  }),
  delete: () => ({
    where: () => Promise.resolve({ rowsAffected: 0 }),
  }),
  query: new Proxy({}, {
    get: () => ({
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
    }),
  }),
};

export type QueryResult<T = Record<string, unknown>> = T[];

// Raw-SQL escape hatch used by the repositories. expo-sqlite has no web
// backend, so this is a no-op that always resolves to an empty result set.
// IMPORTANT: this MUST be exported here — repositories import `executeSql`
// from `./client`, which Metro resolves to this file on web. If it is missing,
// the import is `undefined` and every repository call throws at runtime
// (e.g. accounts never load after login on https://ai-budget.pl). Stores are
// expected to fall back to the API response when this returns no rows.
export function executeSql<T = Record<string, unknown>>(
  _sql: string,
  _params?: (string | number | null)[],
): Promise<QueryResult<T>> {
  return Promise.resolve([]);
}

// Database initialization
export async function initializeDatabase(): Promise<void> {
  // web mock — no-op
}

// No-op transaction wrapper on web (mock DB has no real persistence anyway).
export function withTransaction(task: () => Promise<void>): Promise<void> {
  return task();
}
