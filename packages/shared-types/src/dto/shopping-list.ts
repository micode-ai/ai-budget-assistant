export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  clientId: string;
  canonicalName: string | null;
  rawLabel: string;
  quantity: number;
  note: string | null;
  isChecked: boolean;
  addedByUserId: string;
  sortOrder: number;
}

export interface ShoppingList {
  id: string;
  accountId: string;
  clientId: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdByUserId: string;
  items: ShoppingListItem[];
}

export interface CreateShoppingListDto {
  clientId: string;
  name: string;
}

export interface UpdateShoppingListDto {
  name?: string;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface CreateShoppingListItemDto {
  clientId: string;
  canonicalName?: string | null;
  rawLabel: string;
  quantity?: number;
  note?: string;
}

export interface UpdateShoppingListItemDto {
  isChecked?: boolean;
  quantity?: number;
  rawLabel?: string;
  note?: string | null;
  sortOrder?: number;
}

export interface RestockSuggestion {
  canonicalName: string;
  lastPurchase: string;   // ISO date YYYY-MM-DD
  medianGapDays: number;
  dueInDays: number;      // <= 0 means due/overdue
  purchaseCount: number;
}
