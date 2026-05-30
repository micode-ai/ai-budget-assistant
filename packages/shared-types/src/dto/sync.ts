export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncEntityType = 'expense' | 'budget' | 'category' | 'walletBalance' | 'currencyExchange' | 'income' | 'tag' | 'expense_tag' | 'income_tag' | 'project' | 'project_expense' | 'project_income' | 'expense_category_split' | 'portfolio_holding' | 'investment_transaction';

export interface SyncChange<T = unknown> {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: T;
  encryptedPayload?: string;
  encryptionKeyVersion?: number;
  clientVersion: number;
  accountId: string;
}

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
