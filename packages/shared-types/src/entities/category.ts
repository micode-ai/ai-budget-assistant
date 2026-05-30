import type { CategoryType, SyncStatus } from './primitives';

export interface Category {
  id: string;
  userId?: string;
  accountId?: string;
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
