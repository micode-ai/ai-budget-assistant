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

      CREATE TABLE IF NOT EXISTS expense_items (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        expense_id TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'personal',
        currency_code TEXT NOT NULL DEFAULT 'USD',
        owner_id TEXT NOT NULL,
        icon TEXT,
        is_active INTEGER DEFAULT 1,
        my_role TEXT NOT NULL DEFAULT 'owner',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_members (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        user_name TEXT,
        user_email TEXT,
        joined_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        account_id TEXT,
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

      CREATE TABLE IF NOT EXISTS wallet_balances (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        currency_code TEXT NOT NULL,
        initial_amount REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS currency_exchanges (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        from_amount REAL NOT NULL,
        to_amount REAL NOT NULL,
        exchange_rate REAL NOT NULL,
        date INTEGER NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );
    `);

    // Add receipt_image column to expenses (migration for existing DBs)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN receipt_image TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add account_id column to expenses (multi-account migration)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN account_id TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add account_id column to budgets
    try {
      expoDb.execSync(`ALTER TABLE budgets ADD COLUMN account_id TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add account_id column to categories
    try {
      expoDb.execSync(`ALTER TABLE categories ADD COLUMN account_id TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add discount_amount column to expenses
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN discount_amount REAL`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add session_user_id to accounts (multi-user device isolation)
    try {
      expoDb.execSync(`ALTER TABLE accounts ADD COLUMN session_user_id TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_sync ON expenses(sync_status)',
      'CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_expense_items_expense ON expense_items(expense_id)',
      'CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_budgets_account ON budgets(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_wallet_balances_account ON wallet_balances(account_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_balances_account_currency ON wallet_balances(account_id, currency_code)',
      'CREATE INDEX IF NOT EXISTS idx_currency_exchanges_account ON currency_exchanges(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_currency_exchanges_date ON currency_exchanges(account_id, date DESC)',
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
