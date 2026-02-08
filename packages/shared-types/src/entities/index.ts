// Core domain entities

export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'RUB';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error';

export type ExpenseSource = 'manual' | 'voice' | 'ocr' | 'import';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type CategoryType = 'income' | 'expense';

export type AccountType = 'personal' | 'business' | 'shared';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface User {
  id: string;
  email: string;
  name: string;
  currencyCode: Currency;
  timezone: string;
  defaultAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: Currency;
  ownerId: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMember {
  id: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  joinedAt: Date;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}

export interface Category {
  id: string;
  userId?: string; // null for system categories
  accountId?: string; // null for system categories
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  isSystem: boolean;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface ExpenseItem {
  id: string;
  localId: string;
  expenseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface Expense {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: Date;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  receiptUrl?: string;
  isRecurring: boolean;
  recurringId?: string;
  source: ExpenseSource;
  items?: ExpenseItem[];
  receiptImageBase64?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface Budget {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: Date;
  endDate?: Date;
  categoryId?: string; // null = overall budget
  alertThreshold: number; // percentage (0-100)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
  daysRemaining: number;
  projectedTotal: number;
}

export interface ChatConversation {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensUsed?: number;
  createdAt: Date;
}

export interface Insight {
  id: string;
  userId: string;
  type: 'warning' | 'tip' | 'achievement' | 'anomaly';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}
