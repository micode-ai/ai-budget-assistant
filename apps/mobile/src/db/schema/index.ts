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
  currencyCode: text('currency_code').notNull().default('USD'),
  description: text('description'),
  notes: text('notes'),
  categoryId: text('category_id'),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  time: text('time'),
  locationLat: real('location_lat'),
  locationLng: real('location_lng'),
  locationName: text('location_name'),
  receiptUrl: text('receipt_url'),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).default(false),
  recurringId: text('recurring_id'),
  source: text('source').notNull().default('manual'),
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
  categoryId: text('category_id'),
  alertThreshold: integer('alert_threshold').default(80),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  syncStatus: text('sync_status').notNull().default('pending'),
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

// Chat conversations table
export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
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
  tokensUsed: integer('tokens_used'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Type exports
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
export type SyncQueueRecord = typeof syncQueue.$inferSelect;
export type NewSyncQueueRecord = typeof syncQueue.$inferInsert;
