import type { Currency, SyncStatus } from './primitives';

export interface Project {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  currencyCode?: Currency;
  isArchived: boolean;
  totalExpenses?: number;
  totalIncome?: number;
  expenseCount?: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface ProjectExpense {
  id: string;
  projectId: string;
  expenseId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface ProjectIncome {
  id: string;
  projectId: string;
  incomeId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}
