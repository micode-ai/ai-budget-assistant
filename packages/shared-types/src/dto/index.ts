// Data Transfer Objects for API communication

import type { Currency, ExpenseSource, BudgetPeriod, CategoryType } from '../entities';

// Auth DTOs
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    currencyCode: Currency;
  };
}

// Expense DTOs
export interface CreateExpenseDto {
  localId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string; // ISO string
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  source: ExpenseSource;
}

export interface UpdateExpenseDto {
  amount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
}

// Budget DTOs
export interface CreateBudgetDto {
  localId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  categoryId?: string;
  alertThreshold?: number;
}

export interface UpdateBudgetDto {
  name?: string;
  amount?: number;
  currencyCode?: Currency;
  period?: BudgetPeriod;
  endDate?: string | null;
  categoryId?: string | null;
  alertThreshold?: number;
  isActive?: boolean;
}

// Category DTOs
export interface CreateCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  parentId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

// Sync DTOs
export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncChange<T = unknown> {
  entityType: 'expense' | 'budget' | 'category';
  entityId: string;
  operation: SyncOperation;
  payload: T;
  clientVersion: number;
}

export interface SyncPushRequest {
  changes: SyncChange[];
  lastSyncTimestamp?: string;
}

export interface SyncResult {
  entityId: string;
  status: 'success' | 'conflict' | 'error';
  serverVersion?: number;
  serverId?: string;
  serverData?: unknown;
  error?: string;
}

export interface SyncPushResponse {
  results: SyncResult[];
  serverTimestamp: string;
  summary: {
    success: number;
    conflicts: number;
    errors: number;
  };
}

export interface SyncPullResponse {
  changes: Array<{
    entityType: 'expense' | 'budget' | 'category';
    entityId: string;
    operation: SyncOperation;
    data: unknown;
    version: number;
    timestamp: string;
  }>;
  serverTimestamp: string;
}

// AI DTOs
export interface TranscribeRequest {
  // Audio is sent as form-data
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

export interface ParseExpenseRequest {
  text: string;
  language?: string;
}

export interface ParseExpenseResponse {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryId?: string;
  categorySuggestion?: string;
  confidence: number;
  merchant?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  suggestedActions?: Array<{
    type: 'set_budget' | 'view_chart' | 'add_expense';
    data: Record<string, unknown>;
  }>;
}

// Analytics DTOs
export interface AnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
  topExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
  }>;
  trends: {
    vsLastPeriod: number; // percentage change
    vsAverage: number;
  };
}
