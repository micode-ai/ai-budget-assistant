// Web-specific database implementation using in-memory storage
// expo-sqlite doesn't work on web, so we use a mock implementation

interface MockRow {
  [key: string]: any;
}

interface MockTable {
  rows: MockRow[];
}

class MockDatabase {
  private tables: Map<string, MockTable> = new Map();

  execSync(sql: string): void {
    // Parse CREATE TABLE statements
    const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/gi);
    if (createTableMatch) {
      createTableMatch.forEach((match) => {
        const tableName = match.replace(/CREATE TABLE IF NOT EXISTS /i, '');
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, { rows: [] });
        }
      });
    }
    console.log('[WebDB] Executed SQL (mock)');
  }

  getAllSync(sql: string): MockRow[] {
    console.log('[WebDB] Query:', sql);
    return [];
  }

  runSync(sql: string, params?: any[]): { changes: number; lastInsertRowId: number } {
    console.log('[WebDB] Run:', sql, params);
    return { changes: 0, lastInsertRowId: 0 };
  }
}

// Create mock drizzle-like interface
const mockDb = new MockDatabase();

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
