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

export interface DealSuggestion {
  canonicalName: string;
  merchant: string;
  price: number;      // the current (recent) low price
  avgPrice: number;   // the 90-day average
  dropPct: number;    // e.g. 18 = 18% below average
  currency: string;
}

// --- "my weekly staples" saved templates ---

export interface ShoppingListTemplateItem {
  id: string;
  templateId: string;
  canonicalName: string | null;
  rawLabel: string;
  sortOrder: number;
}

export interface ShoppingListTemplate {
  id: string;
  accountId: string;
  name: string;
  sortOrder: number;
  createdByUserId: string;
  items: ShoppingListTemplateItem[];
}

export interface CreateShoppingListTemplateItemDto {
  rawLabel: string;
  canonicalName?: string | null;
}

export interface CreateShoppingListTemplateDto {
  name: string;
  items: CreateShoppingListTemplateItemDto[];
}

export interface UpdateShoppingListTemplateDto {
  name: string;
}

export interface ApplyShoppingListTemplateDto {
  listId: string;
}

export interface ApplyShoppingListTemplateResponse {
  listId: string;
  listName: string;
  addedLabels: string[];
  skippedLabels: string[];
}
