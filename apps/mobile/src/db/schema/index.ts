import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

// Accounts table
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'personal' | 'business' | 'shared'
  currencyCode: text('currency_code').notNull().default('USD'),
  ownerId: text('owner_id').notNull(),
  icon: text('icon'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  myRole: text('my_role').notNull().default('owner'), // cached role for current user
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Account members table
export const accountMembers = sqliteTable('account_members', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(), // 'owner' | 'editor' | 'viewer'
  userName: text('user_name'),
  userEmail: text('user_email'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
});

// Expenses table
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  localId: text('local_id').notNull(),
  serverId: text('server_id'),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  amount: real('amount').notNull(),
  discountAmount: real('discount_amount'),
  currencyCode: text('currency_code').notNull().default('USD'),
  description: text('description'),
  notes: text('notes'),
  merchant: text('merchant'),
  categoryId: text('category_id'),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  time: text('time'),
  locationLat: real('location_lat'),
  locationLng: real('location_lng'),
  locationName: text('location_name'),
  receiptUrl: text('receipt_url'),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).default(false),
  recurringId: text('recurring_id'),
  recurringPeriod: text('recurring_period'),
  source: text('source').notNull().default('manual'),
  externalRef: text('external_ref'),
  isDebt: integer('is_debt', { mode: 'boolean' }).default(false),
  isDebtRepayment: integer('is_debt_repayment', { mode: 'boolean' }).default(false),
  debtContactName: text('debt_contact_name'),
  debtDueDate: integer('debt_due_date', { mode: 'timestamp' }),
  relatedDebtIncomeId: text('related_debt_income_id'),
  createdByUserName: text('created_by_user_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Incomes table
export const incomes = sqliteTable('incomes', {
  id: text('id').primaryKey(),
  localId: text('local_id').notNull(),
  serverId: text('server_id'),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  amount: real('amount').notNull(),
  currencyCode: text('currency_code').notNull().default('USD'),
  description: text('description'),
  notes: text('notes'),
  categoryId: text('category_id'),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  source: text('source').notNull().default('manual'),
  externalRef: text('external_ref'),
  isDebt: integer('is_debt', { mode: 'boolean' }).default(false),
  isDebtRepayment: integer('is_debt_repayment', { mode: 'boolean' }).default(false),
  debtContactName: text('debt_contact_name'),
  debtDueDate: integer('debt_due_date', { mode: 'timestamp' }),
  relatedDebtExpenseId: text('related_debt_expense_id'),
  createdByUserName: text('created_by_user_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Categories table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  accountId: text('account_id'),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  type: text('type').notNull().default('expense'),
  isSystem: integer('is_system', { mode: 'boolean' }).default(false),
  parentId: text('parent_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Budgets table
export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  localId: text('local_id').notNull(),
  serverId: text('server_id'),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  currencyCode: text('currency_code').notNull().default('USD'),
  period: text('period').notNull().default('monthly'),
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  endDate: integer('end_date', { mode: 'timestamp' }),
  alertThreshold: integer('alert_threshold').default(80),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Budget category allocations table
export const budgetCategories = sqliteTable('budget_categories', {
  id: text('id').primaryKey(),
  budgetId: text('budget_id').notNull(),
  categoryId: text('category_id').notNull(),
  amount: real('amount').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Sync queue table
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: text('payload').notNull(),
  accountId: text('account_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  attempts: integer('attempts').default(0),
  lastError: text('last_error'),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
});

// Sync metadata table
export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Tags table
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  icon: text('icon'),
  usageCount: integer('usage_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Expense tags junction table
export const expenseTags = sqliteTable('expense_tags', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Income tags junction table
export const incomeTags = sqliteTable('income_tags', {
  id: text('id').primaryKey(),
  incomeId: text('income_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  clientId: text('client_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  icon: text('icon'),
  startDate: integer('start_date', { mode: 'timestamp' }),
  endDate: integer('end_date', { mode: 'timestamp' }),
  budget: real('budget'),
  currencyCode: text('currency_code'),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Project expenses junction table
export const projectExpenses = sqliteTable('project_expenses', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  expenseId: text('expense_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Project incomes junction table
export const projectIncomes = sqliteTable('project_incomes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  incomeId: text('income_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Expense category splits table
export const expenseCategorySplits = sqliteTable('expense_category_splits', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull(),
  categoryId: text('category_id').notNull(),
  amount: real('amount').notNull(),
  percentage: real('percentage').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncVersion: integer('sync_version').default(0),
});

// Chat conversations table
export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accountId: text('account_id'),
  isShared: integer('is_shared').default(0),
  title: text('title'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Chat messages table
export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  senderUserId: text('sender_user_id'),
  senderName: text('sender_name'),
  mentionedUserIds: text('mentioned_user_ids'),
  tokensUsed: integer('tokens_used'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Wallet balances table
export const walletBalances = sqliteTable('wallet_balances', {
  id: text('id').primaryKey(),
  localId: text('local_id').notNull(),
  serverId: text('server_id'),
  accountId: text('account_id').notNull(),
  userId: text('user_id').notNull(),
  currencyCode: text('currency_code').notNull(),
  initialAmount: real('initial_amount').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Currency exchanges table
export const currencyExchanges = sqliteTable('currency_exchanges', {
  id: text('id').primaryKey(),
  localId: text('local_id').notNull(),
  serverId: text('server_id'),
  accountId: text('account_id').notNull(),
  userId: text('user_id').notNull(),
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),
  fromAmount: real('from_amount').notNull(),
  toAmount: real('to_amount').notNull(),
  exchangeRate: real('exchange_rate').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
  externalRef: text('external_ref'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
  syncVersion: integer('sync_version').default(0),
});

// Gamification: achievements cache
export const userAchievements = sqliteTable('user_achievements', {
  id: text('id').primaryKey(),
  achievementId: text('achievement_id').notNull(),
  progress: integer('progress').default(0),
  isCompleted: integer('is_completed', { mode: 'boolean' }).default(false),
  unlockedAt: integer('unlocked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Gamification: streak cache
export const userStreaks = sqliteTable('user_streaks', {
  id: text('id').primaryKey(),
  streakType: text('streak_type').notNull().default('daily_tracking'),
  currentStreak: integer('current_streak').default(0),
  longestStreak: integer('longest_streak').default(0),
  lastActivityDate: integer('last_activity_date', { mode: 'timestamp' }),
  streakStartDate: integer('streak_start_date', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Encryption keys table (local cache for E2EE account keys)
export const encryptionKeys = sqliteTable('encryption_keys', {
  accountId: text('account_id').primaryKey(),
  accountKey: text('account_key').notNull(), // encrypted by secureStorage
  keyVersion: integer('key_version').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Type exports
export type EncryptionKeyRecord = typeof encryptionKeys.$inferSelect;
export type NewEncryptionKeyRecord = typeof encryptionKeys.$inferInsert;
export type UserAchievementRecord = typeof userAchievements.$inferSelect;
export type UserStreakRecord = typeof userStreaks.$inferSelect;
export type WalletBalanceRecord = typeof walletBalances.$inferSelect;
export type NewWalletBalanceRecord = typeof walletBalances.$inferInsert;
export type CurrencyExchangeRecord = typeof currencyExchanges.$inferSelect;
export type NewCurrencyExchangeRecord = typeof currencyExchanges.$inferInsert;
export type AccountRecord = typeof accounts.$inferSelect;
export type NewAccountRecord = typeof accounts.$inferInsert;
export type AccountMemberRecord = typeof accountMembers.$inferSelect;
export type NewAccountMemberRecord = typeof accountMembers.$inferInsert;
export type ExpenseRecord = typeof expenses.$inferSelect;
export type NewExpenseRecord = typeof expenses.$inferInsert;
export type CategoryRecord = typeof categories.$inferSelect;
export type NewCategoryRecord = typeof categories.$inferInsert;
export type BudgetRecord = typeof budgets.$inferSelect;
export type NewBudgetRecord = typeof budgets.$inferInsert;
export type IncomeRecord = typeof incomes.$inferSelect;
export type NewIncomeRecord = typeof incomes.$inferInsert;
export type SyncQueueRecord = typeof syncQueue.$inferSelect;
export type NewSyncQueueRecord = typeof syncQueue.$inferInsert;
export type TagRecord = typeof tags.$inferSelect;
export type NewTagRecord = typeof tags.$inferInsert;
export type ExpenseTagRecord = typeof expenseTags.$inferSelect;
export type NewExpenseTagRecord = typeof expenseTags.$inferInsert;
export type IncomeTagRecord = typeof incomeTags.$inferSelect;
export type NewIncomeTagRecord = typeof incomeTags.$inferInsert;
export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;
export type ProjectExpenseRecord = typeof projectExpenses.$inferSelect;
export type NewProjectExpenseRecord = typeof projectExpenses.$inferInsert;
export type ProjectIncomeRecord = typeof projectIncomes.$inferSelect;
export type NewProjectIncomeRecord = typeof projectIncomes.$inferInsert;
export type ExpenseCategorySplitRecord = typeof expenseCategorySplits.$inferSelect;
export type NewExpenseCategorySplitRecord = typeof expenseCategorySplits.$inferInsert;
