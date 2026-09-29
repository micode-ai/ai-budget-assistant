import { httpClient } from './http-client';
import type {
  ShoppingList,
  ShoppingListItem,
  CreateShoppingListDto,
  UpdateShoppingListDto,
  CreateShoppingListItemDto,
  UpdateShoppingListItemDto,
  BasketCompareResponse,
  BasketCompareItem,
  RestockSuggestion,
  DealSuggestion,
  ShoppingListTemplate,
  CreateShoppingListTemplateDto,
  UpdateShoppingListTemplateDto,
  ApplyShoppingListTemplateResponse,
  ShoppingListGuestLinkResponse,
  ShoppingItemPriceHint,
  ScanPriceTagResponse,
} from '@budget/shared-types';

export const shoppingListsApi = {
  getLists() {
    return httpClient.request<ShoppingList[]>('/shopping-list');
  },

  createList(dto: CreateShoppingListDto) {
    return httpClient.request<ShoppingList>('/shopping-list', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  updateList(id: string, dto: UpdateShoppingListDto) {
    return httpClient.request<ShoppingList>(`/shopping-list/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  deleteList(id: string) {
    return httpClient.request<void>(`/shopping-list/${id}`, { method: 'DELETE' });
  },

  addItem(listId: string, dto: CreateShoppingListItemDto) {
    return httpClient.request<ShoppingListItem>(`/shopping-list/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  updateItem(itemId: string, dto: UpdateShoppingListItemDto) {
    return httpClient.request<ShoppingListItem>(`/shopping-list/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  /** Last receipt price for a product, or undefined/null when there is none. */
  getItemPriceHint(name: string) {
    return httpClient.request<ShoppingItemPriceHint | null | undefined>(
      `/shopping-list/price-hint?name=${encodeURIComponent(name)}`,
    );
  },

  /** Reads a shelf price tag photo (1 AI request). Creates nothing. */
  scanPriceTag(imageBase64: string) {
    return httpClient.request<ScanPriceTagResponse>('/ai/scan-price-tag', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
    });
  },

  deleteItem(itemId: string) {
    return httpClient.request<void>(`/shopping-list/items/${itemId}`, { method: 'DELETE' });
  },

  clearChecked(listId: string) {
    return httpClient.request<{ cleared: number }>(`/shopping-list/${listId}/clear-checked`, {
      method: 'POST',
    });
  },

  compareBasket(items: BasketCompareItem[], origin?: { lat: number; lng: number }) {
    return httpClient.request<BasketCompareResponse>('/price-history/basket', {
      method: 'POST',
      body: JSON.stringify({ items, ...(origin ? { lat: origin.lat, lng: origin.lng } : {}) }),
    });
  },

  getRestockSuggestions() {
    return httpClient.request<RestockSuggestion[]>('/shopping-list/suggestions');
  },

  getDeals() {
    return httpClient.request<DealSuggestion[]>('/shopping-list/deals');
  },

  // --- "my weekly staples" templates ---

  getShoppingListTemplates() {
    return httpClient.request<ShoppingListTemplate[]>('/shopping-list/templates');
  },

  createShoppingListTemplate(dto: CreateShoppingListTemplateDto) {
    return httpClient.request<ShoppingListTemplate>('/shopping-list/templates', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  renameShoppingListTemplate(id: string, dto: UpdateShoppingListTemplateDto) {
    return httpClient.request<ShoppingListTemplate>(`/shopping-list/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  deleteShoppingListTemplate(id: string) {
    return httpClient.request<void>(`/shopping-list/templates/${id}`, { method: 'DELETE' });
  },

  applyShoppingListTemplate(id: string, listId: string) {
    return httpClient.request<ApplyShoppingListTemplateResponse>(
      `/shopping-list/templates/${id}/apply`,
      { method: 'POST', body: JSON.stringify({ listId }) },
    );
  },

  // --- guest share link (shopping-list-guest-share-link) ---

  createShoppingListGuestLink(listId: string) {
    return httpClient.request<ShoppingListGuestLinkResponse>(`/shopping-list/${listId}/guest-link`, {
      method: 'POST',
    });
  },

  revokeShoppingListGuestLink(listId: string) {
    return httpClient.request<void>(`/shopping-list/${listId}/guest-link`, { method: 'DELETE' });
  },
};
