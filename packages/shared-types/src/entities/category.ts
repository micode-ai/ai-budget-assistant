import type { CategoryType } from './primitives';

export interface Category {
  id: string;
  /** The device-generated id this row was created with (offline-first). */
  clientId?: string;
  userId?: string;
  accountId?: string;
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  isSystem: boolean;
  /** Catalog key; server-owned, absent on custom categories. */
  systemKey?: string | null;
  nameCustomized?: boolean;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}
