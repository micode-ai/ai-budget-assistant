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

// Database initialization
export async function initializeDatabase(): Promise<void> {
  console.log('[WebDB] Database initialized (web mock - data not persisted)');
  console.log('[WebDB] For full functionality, please use the mobile app on iOS/Android');
}

// No-op transaction wrapper on web (mock DB has no real persistence anyway).
export function withTransaction(task: () => Promise<void>): Promise<void> {
  return task();
}
