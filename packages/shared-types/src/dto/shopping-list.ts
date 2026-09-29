export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  clientId: string;
  canonicalName: string | null;
  rawLabel: string;
  quantity: number;
  /** Price per unit the user typed in, in the account's currency. null = not priced. */
  unitPrice: number | null;
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
  unitPrice?: number | null;
  note?: string;
}

export interface UpdateShoppingListItemDto {
  isChecked?: boolean;
  quantity?: number;
  /** null clears the price. */
  unitPrice?: number | null;
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

/** Last price paid for a product on a scanned receipt, in the account's currency. */
export interface ShoppingItemPriceHint {
  unitPrice: number;
  merchant: string | null;
  date: string; // ISO date YYYY-MM-DD
}

/**
 * What `POST /ai/scan-price-tag` read off a shelf price tag. Every field is
 * nullable: a blurry or cropped tag yields what it yields, never a guess.
 */
export interface ScanPriceTagResponse {
  productName: string | null;
  /** The price to pay now (the promo price when a promo is on). */
  price: number | null;
  /** ISO 4217, or null when the tag shows no currency. */
  currencyCode: string | null;
  /** Pack size as printed, e.g. "500 g", "1 l", "6 x 0,5 l". */
  size: string | null;
  /** Price per kg/l/piece as printed, e.g. "9,98 zł/kg". */
  unitPriceText: string | null;
  /** The crossed-out regular price, when the tag shows a promo. */
  regularPrice: number | null;
  /** Last day of the promo as printed, e.g. "05.10". */
  promoUntil: string | null;
  /** True when the price shown needs a loyalty card or app. */
  requiresLoyaltyCard: boolean;
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

// --- guest share link (shopping-list-guest-share-link) ---

export interface ShoppingListGuestLinkResponse {
  token: string;
  /** Absolute URL — hand this straight to a share sheet. */
  url: string;
}
