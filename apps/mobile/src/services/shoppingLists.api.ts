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
};
