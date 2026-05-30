export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncEntityType =
  | 'expense'
  | 'expense_item'
  | 'budget'
  | 'category'
  | 'walletBalance'
  | 'currencyExchange'
  | 'income'
  | 'tag'
  | 'expense_tag'
  | 'income_tag'
  | 'project'
  | 'project_expense'
  | 'project_income'
  | 'expense_category_split'
  | 'portfolio_holding'
  | 'investment_transaction';

// ---- Per-entity payload interfaces ----

export interface SyncExpensePayload {
  localId?: string;
  amount: number;
  discountAmount?: number;
  currencyCode: string;
  description?: string;
  notes?: string;
  merchant?: string;
  categoryId?: string;
  tagIds?: string[];
  projectId?: string | null;
  date: string;
  source?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtIncomeId?: string;
  isRecurring?: boolean;
  recurringId?: string;
  recurringPeriod?: string;
}

export interface SyncIncomePayload {
  localId?: string;
  amount: number;
  currencyCode: string;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string;
  source?: string;
  isDebt?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtExpenseId?: string;
}

export interface SyncExpenseItemPayload {
  expenseId: string;
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  sortOrder?: number;
}

export interface SyncTagPayload {
  name: string;
  color?: string;
  icon?: string;
  clientId?: string;
}

export interface SyncProjectPayload {
  localId?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currencyCode?: string;
}

export interface SyncPortfolioHoldingPayload {
  localId?: string;
  assetSymbol: string;
  assetExchange?: string;
  assetName: string;
  assetType: string;
  notes?: string;
}

export interface SyncInvestmentTransactionPayload {
  localId?: string;
  holdingId: string;
  type: string;
  quantity: number;
  pricePerUnit: number;
  fee?: number;
  date: string;
  notes?: string;
}

export interface SyncExpenseTagPayload {
  expenseId: string;
  tagId: string;
}

export interface SyncIncomeTagPayload {
  incomeId: string;
  tagId: string;
}

export interface SyncProjectExpensePayload {
  projectId: string;
  expenseId: string;
}

export interface SyncProjectIncomePayload {
  projectId: string;
  incomeId: string;
}

export interface SyncExpenseCategorySplitPayload {
  expenseId: string;
  categoryId: string;
  amount: number;
  percentage: number;
  notes?: string;
}

// ---- Shared base fields ----

interface SyncChangeBase {
  entityId: string;
  operation: SyncOperation;
  encryptedPayload?: string;
  encryptionKeyVersion?: number;
  clientVersion: number;
  accountId: string;
}

// ---- Discriminated union ----

export type SyncChange =
  | (SyncChangeBase & { entityType: 'expense'; payload: SyncExpensePayload })
  | (SyncChangeBase & { entityType: 'income'; payload: SyncIncomePayload })
  | (SyncChangeBase & { entityType: 'expense_item'; payload: SyncExpenseItemPayload })
  | (SyncChangeBase & { entityType: 'tag'; payload: SyncTagPayload })
  | (SyncChangeBase & { entityType: 'project'; payload: SyncProjectPayload })
  | (SyncChangeBase & { entityType: 'portfolio_holding'; payload: SyncPortfolioHoldingPayload })
  | (SyncChangeBase & { entityType: 'investment_transaction'; payload: SyncInvestmentTransactionPayload })
  | (SyncChangeBase & { entityType: 'expense_tag'; payload: SyncExpenseTagPayload })
  | (SyncChangeBase & { entityType: 'income_tag'; payload: SyncIncomeTagPayload })
  | (SyncChangeBase & { entityType: 'project_expense'; payload: SyncProjectExpensePayload })
  | (SyncChangeBase & { entityType: 'project_income'; payload: SyncProjectIncomePayload })
  | (SyncChangeBase & { entityType: 'expense_category_split'; payload: SyncExpenseCategorySplitPayload })
  | (SyncChangeBase & { entityType: 'budget'; payload: Record<string, unknown> })
  | (SyncChangeBase & { entityType: 'category'; payload: Record<string, unknown> })
  | (SyncChangeBase & { entityType: 'walletBalance'; payload: Record<string, unknown> })
  | (SyncChangeBase & { entityType: 'currencyExchange'; payload: Record<string, unknown> });

export interface SyncPushRequest {
  changes: SyncChange[];
  lastSyncTimestamp?: string;
  accountId: string;
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
    entityType: SyncEntityType;
    entityId: string;
    operation: SyncOperation;
    data: unknown;
    version: number;
    timestamp: string;
  }>;
  serverTimestamp: string;
}
