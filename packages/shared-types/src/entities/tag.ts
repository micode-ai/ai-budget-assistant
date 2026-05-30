import type { SyncStatus } from './primitives';

export interface Tag {
  id: string;
  clientId?: string;
  accountId: string;
  name: string;
  color?: string;
  icon?: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface ExpenseTag {
  id: string;
  expenseId: string;
  tagId: string;
  tag?: Tag;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface IncomeTag {
  id: string;
  incomeId: string;
  tagId: string;
  tag?: Tag;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}
