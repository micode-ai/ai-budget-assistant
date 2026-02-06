import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

// Open database using expo-sqlite new API (Expo SDK 54)
const expoDb = SQLite.openDatabaseSync('budget.db');

// Export the raw database for direct access
export const db = expoDb;

// Export schema for reference
export { schema };

// Type for query results
export type QueryResult<T = Record<string, unknown>> = T[];

// Helper to execute a single SQL query with parameters
export function executeSql<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<QueryResult<T>> {
  return Promise.resolve(expoDb.getAllSync<T>(sql, ...params));
}

// Database initialization
export async function initializeDatabase(): Promise<void> {
  try {
    // Run migrations using the new expo-sqlite API
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency_code TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        notes TEXT,
        category_id TEXT,
        date INTEGER NOT NULL,
        time TEXT,
        location_lat REAL,
        location_lng REAL,
        location_name TEXT,
        receipt_url TEXT,
        is_recurring INTEGER DEFAULT 0,
        recurring_id TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        type TEXT NOT NULL DEFAULT 'expense',
        is_system INTEGER DEFAULT 0,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        currency_code TEXT NOT NULL DEFAULT 'USD',
        period TEXT NOT NULL DEFAULT 'monthly',
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        category_id TEXT,
        alert_threshold INTEGER DEFAULT 80,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        last_attempt_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens_used INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_sync ON expenses(sync_status)',
      'CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id)',
    ];

    for (const indexSql of indexes) {
      try {
        expoDb.execSync(indexSql);
      } catch (e) {
        // Index might already exist, continue
        console.warn('Index creation warning:', e);
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}
