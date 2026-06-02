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

// Run `task` inside a single SQLite transaction. Any awaited executeSql calls
// inside resolve synchronously (expo-sqlite uses getAllSync underneath), so
// dozens of upserts collapse into one BEGIN/COMMIT — orders of magnitude
// faster than one transaction per statement.
export function withTransaction(task: () => Promise<void>): Promise<void> {
  return expoDb.withTransactionAsync(task);
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
        account_id TEXT,
        is_shared INTEGER DEFAULT 0,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sender_user_id TEXT,
        sender_name TEXT,
        mentioned_user_ids TEXT,
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

    // Account transfers table
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS account_transfers (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        user_id TEXT NOT NULL,
        from_account_id TEXT NOT NULL,
        from_currency TEXT NOT NULL,
        from_amount REAL NOT NULL,
        to_account_id TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        to_amount REAL NOT NULL,
        exchange_rate REAL NOT NULL,
        date INTEGER NOT NULL,
        notes TEXT,
        count_as_income INTEGER DEFAULT 0,
        linked_income_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );
    `);

    // Incomes table
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS incomes (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency_code TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        notes TEXT,
        category_id TEXT,
        date INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );
    `);

    // Tags, Projects, Splits tables
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS expense_tags (
        id TEXT PRIMARY KEY,
        expense_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS income_tags (
        id TEXT PRIMARY KEY,
        income_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (income_id) REFERENCES incomes(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        icon TEXT,
        start_date INTEGER,
        end_date INTEGER,
        budget REAL,
        currency_code TEXT,
        is_archived INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS project_expenses (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        expense_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_incomes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        income_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (income_id) REFERENCES incomes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS expense_category_splits (
        id TEXT PRIMARY KEY,
        expense_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        amount REAL NOT NULL,
        percentage REAL NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS budget_categories (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
    `);

    // Encryption keys table (local cache for E2EE account keys)
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS encryption_keys (
        account_id TEXT PRIMARY KEY,
        account_key TEXT NOT NULL,
        key_version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `);

    // Gamification tables
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id TEXT PRIMARY KEY,
        achievement_id TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        unlocked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_streaks (
        id TEXT PRIMARY KEY,
        streak_type TEXT NOT NULL DEFAULT 'daily_tracking',
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_activity_date INTEGER,
        streak_start_date INTEGER,
        updated_at INTEGER NOT NULL
      );
    `);

    // Investment tables
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        exchange TEXT,
        current_price REAL,
        price_currency TEXT NOT NULL DEFAULT 'USD',
        logo_url TEXT,
        last_price_update INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portfolio_holdings (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        average_cost_basis REAL NOT NULL DEFAULT 0,
        total_invested REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (asset_id) REFERENCES assets(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS investment_transactions (
        id TEXT PRIMARY KEY,
        local_id TEXT NOT NULL,
        server_id TEXT,
        holding_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        price_per_unit REAL NOT NULL,
        total_amount REAL NOT NULL,
        fee REAL NOT NULL DEFAULT 0,
        date INTEGER NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_version INTEGER DEFAULT 0,
        FOREIGN KEY (holding_id) REFERENCES portfolio_holdings(id) ON DELETE CASCADE
      );
    `);

    // Add receipt_image column to expenses (migration for existing DBs)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN receipt_image TEXT`);
    } catch {
      // Column already exists, ignore
    }

    // Add receipt_image_mime column to expenses (migration for existing DBs)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN receipt_image_mime TEXT`);
    } catch {
      // Column already exists, ignore
    }

    // Add account_id column to expenses (multi-account migration)
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN account_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists, ignore
    }

    // Add account_id column to budgets
    try {
      expoDb.execSync(`ALTER TABLE budgets ADD COLUMN account_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists, ignore
    }

    // Add account_id column to categories
    try {
      expoDb.execSync(`ALTER TABLE categories ADD COLUMN account_id TEXT`);
    } catch {
      // Column already exists, ignore
    }

    // Add discount_amount column to expenses
    try {
      expoDb.execSync(`ALTER TABLE expenses ADD COLUMN discount_amount REAL`);
    } catch {
      // Column already exists, ignore
    }

    // Add session_user_id to accounts (multi-user device isolation)
    try {
      expoDb.execSync(`ALTER TABLE accounts ADD COLUMN session_user_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists, ignore
    }

    // Debt tracking fields for expenses
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN is_debt INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN is_debt_repayment INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN debt_contact_name TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN debt_due_date INTEGER`); } catch {}
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN related_debt_income_id TEXT`); } catch {}

    // Merchant field for expenses
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN merchant TEXT`); } catch {}

    // Debt tracking fields for incomes
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN is_debt INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN is_debt_repayment INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN debt_contact_name TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN debt_due_date INTEGER`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN related_debt_expense_id TEXT`); } catch {}

    // Source field for incomes (voice/ocr/import/manual)
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`); } catch {}

    // Count-as-income fields for account transfers
    try { expoDb.execSync(`ALTER TABLE account_transfers ADD COLUMN count_as_income INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE account_transfers ADD COLUMN linked_income_id TEXT`); } catch {}

    // Recurring period for expense series
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN recurring_period TEXT`); } catch {}

    // Transaction attribution: cache the creator's display name on each row so
    // shared-account screens can show "Added by …" without an extra user lookup.
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN created_by_user_name TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN created_by_user_name TEXT`); } catch {}

    // External reference for CSV/bank imports (e.g. "wise:<TransferWise ID>")
    try { expoDb.execSync(`ALTER TABLE expenses ADD COLUMN external_ref TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE incomes ADD COLUMN external_ref TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE currency_exchanges ADD COLUMN external_ref TEXT`); } catch {}

    // Shared AI chat columns (migration for existing DBs)
    try { expoDb.execSync(`ALTER TABLE chat_conversations ADD COLUMN account_id TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_conversations ADD COLUMN is_shared INTEGER DEFAULT 0`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN sender_user_id TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN sender_name TEXT`); } catch {}
    try { expoDb.execSync(`ALTER TABLE chat_messages ADD COLUMN mentioned_user_ids TEXT`); } catch {}

    // Debt indexes
    expoDb.execSync(`CREATE INDEX IF NOT EXISTS idx_expenses_debt ON expenses(account_id, is_debt)`);
    expoDb.execSync(`CREATE INDEX IF NOT EXISTS idx_incomes_debt ON incomes(account_id, is_debt)`);

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
      'CREATE INDEX IF NOT EXISTS idx_incomes_account ON incomes(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(account_id, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_incomes_sync ON incomes(sync_status)',
      // Tags indexes
      'CREATE INDEX IF NOT EXISTS idx_tags_account ON tags(account_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_account_name ON tags(account_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_expense_tags_expense ON expense_tags(expense_id)',
      'CREATE INDEX IF NOT EXISTS idx_expense_tags_tag ON expense_tags(tag_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_tags_unique ON expense_tags(expense_id, tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_income_tags_income ON income_tags(income_id)',
      'CREATE INDEX IF NOT EXISTS idx_income_tags_tag ON income_tags(tag_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_income_tags_unique ON income_tags(income_id, tag_id)',
      // Projects indexes
      'CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(account_id, is_archived)',
      'CREATE INDEX IF NOT EXISTS idx_project_expenses_project ON project_expenses(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_project_expenses_expense ON project_expenses(expense_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_unique ON project_expenses(project_id, expense_id)',
      'CREATE INDEX IF NOT EXISTS idx_project_incomes_project ON project_incomes(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_project_incomes_income ON project_incomes(income_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_project_incomes_unique ON project_incomes(project_id, income_id)',
      // Splits indexes
      'CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_category_splits(expense_id)',
      'CREATE INDEX IF NOT EXISTS idx_expense_splits_category ON expense_category_splits(category_id)',
      // Budget categories indexes
      'CREATE INDEX IF NOT EXISTS idx_budget_categories_budget ON budget_categories(budget_id)',
      'CREATE INDEX IF NOT EXISTS idx_budget_categories_category ON budget_categories(category_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_categories_unique ON budget_categories(budget_id, category_id)',
      // Gamification indexes
      'CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id)',
      // Investment indexes
      'CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_account ON portfolio_holdings(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_asset ON portfolio_holdings(asset_id)',
      'CREATE INDEX IF NOT EXISTS idx_investment_transactions_holding ON investment_transactions(holding_id)',
      'CREATE INDEX IF NOT EXISTS idx_investment_transactions_account ON investment_transactions(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_investment_transactions_date ON investment_transactions(account_id, date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_investment_transactions_sync ON investment_transactions(sync_status)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_sync ON portfolio_holdings(sync_status)',
    ];

    for (const indexSql of indexes) {
      try {
        expoDb.execSync(indexSql);
      } catch (e) {
        // Index might already exist, continue
        console.warn('Index creation warning:', e);
      }
    }

  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}
