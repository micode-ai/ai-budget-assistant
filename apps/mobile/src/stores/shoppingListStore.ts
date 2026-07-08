import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import type {
  ShoppingList,
  ShoppingListItem,
  BasketCompareItem,
  BasketCompareResponse,
  RestockSuggestion,
} from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import i18n from '@/i18n';
import {
  upsertShoppingList,
  deleteShoppingList,
  markShoppingListSynced,
} from '@/db/shoppingListRepository';
import type { ShoppingListLocal } from '@/db/shoppingListRepository';
import {
  upsertShoppingListItem,
  updateShoppingListItem,
  softDeleteShoppingListItem,
  markShoppingListItemSynced,
} from '@/db/shoppingListItemRepository';
import type { ShoppingListItemLocal } from '@/db/shoppingListItemRepository';
import { api } from '@/services/api';
import { pullAndMergeShoppingLists } from './shoppingListSync';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';
import { useSubscriptionStore } from './subscriptionStore';
import { useUpgradeStore } from './upgradeStore';

const ACTIVE_LIST_KEY = 'shopping-active-list';
const mmkv = new MMKV({ id: 'shopping-list' });

interface ShoppingListState {
  lists: ShoppingList[];
  activeListId: string | null;
  items: ShoppingListItem[]; // derived: the active list's items, auto-recomputed below
  suggestions: RestockSuggestion[];
  basketResult: BasketCompareResponse | null;
  isComparing: boolean;
  isLoading: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  loadSuggestions: () => Promise<void>;
  dismissSuggestion: (canonicalName: string) => void;
  addItem: (rawLabel: string, canonicalName?: string | null, quantity?: number) => Promise<void>;
  toggleChecked: (itemId: string) => void;
  updateQuantity: (itemId: string, qty: number) => void;
  removeItem: (itemId: string) => void;
  clearChecked: () => Promise<void>;
  createList: (name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  setActiveList: (id: string) => void;
  compareBasket: () => Promise<void>;
}

export const useShoppingListStore = create<ShoppingListState>()(
  subscribeWithSelector((set, get) => ({
    lists: [],
    activeListId: mmkv.getString(ACTIVE_LIST_KEY) ?? null,
    items: [],
    suggestions: [],
    basketResult: null,
    isComparing: false,
    isLoading: false,
    error: null,

    hydrate: async () => {
      set({ suggestions: [] });

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        set({ lists: [], isLoading: false });
        return;
      }

      await pullAndMergeShoppingLists(accountId, set as any);

      // Default the active list once we know what lists exist (first-ever
      // hydrate, or the previously-active list vanished — e.g. deleted on
      // another device).
      const { lists, activeListId } = get();
      if (lists.length > 0 && (!activeListId || !lists.some((l) => l.id === activeListId))) {
        const def = lists.find((l) => l.isDefault) ?? lists[0];
        get().setActiveList(def.id);
      }

      get().loadSuggestions();
    },

    loadSuggestions: async () => {
      try {
        const suggestions = await api.getRestockSuggestions();
        set({ suggestions });
      } catch (e) {
        console.warn('Failed to load restock suggestions:', e);
      }
    },

    dismissSuggestion: (canonicalName) => {
      set((s) => ({
        suggestions: s.suggestions.filter((x) => x.canonicalName !== canonicalName),
      }));
    },

    setActiveList: (id) => {
      set({ activeListId: id });
      mmkv.set(ACTIVE_LIST_KEY, id);
    },

    createList: async (name) => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return;

      const id = generateUUID();
      const now = new Date();
      const userId = useAuthStore.getState().user?.id ?? '';

      const newList: ShoppingListLocal = {
        id,
        accountId,
        clientId: id,
        name,
        isDefault: false,
        isArchived: false,
        sortOrder: get().lists.length,
        createdByUserId: userId,
        items: [],
        isDeleted: false,
        syncStatus: 'pending',
        syncVersion: 0,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => ({ lists: [...state.lists, newList] }));

      try {
        await upsertShoppingList(newList);
      } catch (e) {
        console.error('Failed to insert shopping list in SQLite:', e);
      }

      // Row stays 'pending' (both in SQLite and in-memory) until the server
      // ack lands — marking it 'synced' before that would let a concurrent
      // hydrate()'s merge see a "synced" row absent from the server response
      // (the server hasn't processed the create yet) and tombstone it,
      // permanently deleting the list on the next pending-sweep push.
      api
        .createList({ clientId: id, name })
        .then(() => {
          markShoppingListSynced(id).catch(() => {});
        })
        .catch((e) => {
          // Offline (or server error) — row stays 'pending' and retries on
          // the next hydrate()'s pending-sweep. Do NOT revert/delete it.
          console.warn('Shopping list create sync deferred (offline?):', e);
        });
    },

    deleteList: async (id) => {
      const list = get().lists.find((l) => l.id === id);
      if (!list) return;

      set((state) => {
        const remaining = state.lists.filter((l) => l.id !== id);
        const activeListId =
          state.activeListId === id ? (remaining[0]?.id ?? null) : state.activeListId;
        return { lists: remaining, activeListId };
      });

      const nextActiveId = get().activeListId;
      if (nextActiveId) mmkv.set(ACTIVE_LIST_KEY, nextActiveId);
      else mmkv.delete(ACTIVE_LIST_KEY);

      try {
        // Cascade-soft-delete the list's local items (mirrors the server's
        // own deleteList transaction).
        for (const item of list.items) {
          await softDeleteShoppingListItem(item.id);
        }
        await deleteShoppingList(id);
      } catch (e) {
        console.error('Failed to delete shopping list in SQLite:', e);
      }

      api.deleteList(id).catch((e) =>
        console.warn('Shopping list delete sync deferred (offline?):', e),
      );
    },

    addItem: async (rawLabel, canonicalName = null, quantity = 1) => {
      const accountId = useAccountStore.getState().currentAccountId;
      const { lists, activeListId } = get();
      const listId = activeListId ?? lists.find((l) => l.isDefault)?.id ?? lists[0]?.id;
      if (!accountId || !listId) return;

      const list = lists.find((l) => l.id === listId);
      const id = generateUUID();
      const now = new Date();
      const userId = useAuthStore.getState().user?.id ?? '';

      const newItem: ShoppingListItemLocal = {
        id,
        shoppingListId: listId,
        clientId: id,
        canonicalName: canonicalName ?? null,
        rawLabel,
        quantity,
        note: null,
        isChecked: false,
        addedByUserId: userId,
        sortOrder: list ? list.items.length : 0,
        accountId,
        isDeleted: false,
        syncStatus: 'pending',
        syncVersion: 0,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => ({
        lists: state.lists.map((l) =>
          l.id === listId ? { ...l, items: [...l.items, newItem] } : l,
        ),
      }));

      try {
        await upsertShoppingListItem(newItem);
      } catch (e) {
        console.error('Failed to insert shopping list item in SQLite:', e);
      }

      // Row stays 'pending' until the server ack lands — see createList's
      // comment above for why marking it 'synced' early is unsafe.
      api
        .addItem(listId, {
          clientId: id,
          canonicalName: canonicalName ?? undefined,
          rawLabel,
          quantity,
        })
        .then(() => {
          markShoppingListItemSynced(id).catch(() => {});
        })
        .catch((e) => {
          // Offline (or server error) — row stays 'pending' and retries on
          // the next hydrate()'s pending-sweep. Do NOT revert/delete it.
          console.warn('Shopping list item add sync deferred (offline?):', e);
        });
    },

    toggleChecked: (itemId) => {
      let nextChecked = false;
      set((state) => ({
        lists: state.lists.map((l) => ({
          ...l,
          items: l.items.map((it) => {
            if (it.id !== itemId) return it;
            nextChecked = !it.isChecked;
            return { ...it, isChecked: nextChecked };
          }),
        })),
      }));

      updateShoppingListItem(itemId, { isChecked: nextChecked }).catch((e) =>
        console.error('Failed to update shopping list item in SQLite:', e),
      );

      api.updateItem(itemId, { isChecked: nextChecked }).catch((e) =>
        console.warn('Shopping list item toggle sync deferred (offline?):', e),
      );
    },

    updateQuantity: (itemId, qty) => {
      set((state) => ({
        lists: state.lists.map((l) => ({
          ...l,
          items: l.items.map((it) => (it.id === itemId ? { ...it, quantity: qty } : it)),
        })),
      }));

      updateShoppingListItem(itemId, { quantity: qty }).catch((e) =>
        console.error('Failed to update shopping list item in SQLite:', e),
      );

      api.updateItem(itemId, { quantity: qty }).catch((e) =>
        console.warn('Shopping list item quantity sync deferred (offline?):', e),
      );
    },

    removeItem: (itemId) => {
      set((state) => ({
        lists: state.lists.map((l) => ({
          ...l,
          items: l.items.filter((it) => it.id !== itemId),
        })),
      }));

      softDeleteShoppingListItem(itemId).catch((e) =>
        console.error('Failed to delete shopping list item in SQLite:', e),
      );

      api.deleteItem(itemId).catch((e) =>
        console.warn('Shopping list item delete sync deferred (offline?):', e),
      );
    },

    clearChecked: async () => {
      const { lists, activeListId } = get();
      const list = lists.find((l) => l.id === activeListId);
      if (!list) return;
      const checked = list.items.filter((it) => it.isChecked);
      if (checked.length === 0) return;

      set((state) => ({
        lists: state.lists.map((l) =>
          l.id === list.id ? { ...l, items: l.items.filter((it) => !it.isChecked) } : l,
        ),
      }));

      for (const it of checked) {
        try {
          await softDeleteShoppingListItem(it.id);
        } catch (e) {
          console.error('Failed to delete shopping list item in SQLite:', e);
        }
      }

      api.clearChecked(list.id).catch((e) =>
        console.warn('Shopping list clear-checked sync deferred (offline?):', e),
      );
    },

    compareBasket: async () => {
      const { lists, activeListId } = get();
      const list = lists.find((l) => l.id === activeListId);
      if (!list) return;

      const items: BasketCompareItem[] = list.items
        .filter((it) => !it.isChecked && it.canonicalName)
        .map((it) => ({ canonicalName: it.canonicalName as string, quantity: it.quantity }));

      if (items.length === 0) return;

      if (!useSubscriptionStore.getState().isPro()) {
        useUpgradeStore.getState().show(i18n.t('shoppingList.comparePaywall'), 'pro');
        return;
      }

      set({ isComparing: true });
      try {
        const result = await api.compareBasket(items);
        set({ basketResult: result, isComparing: false });
      } catch (e) {
        set({ isComparing: false });
        const status = (e as { status?: number }).status;
        if (status === 403) {
          useUpgradeStore.getState().show(i18n.t('shoppingList.comparePaywall'), 'pro');
        } else {
          console.warn('Basket compare failed:', e);
        }
      }
    },
  })),
);

// Auto-recompute `items` (the active list's items) whenever `lists` or
// `activeListId` changes — mirrors expenseStore's totalThisMonth subscription.
function recomputeActiveItems(): void {
  const { lists, activeListId } = useShoppingListStore.getState();
  const items = lists.find((l) => l.id === activeListId)?.items ?? [];
  useShoppingListStore.setState({ items });
}

useShoppingListStore.subscribe((s) => s.lists, recomputeActiveItems);
useShoppingListStore.subscribe((s) => s.activeListId, recomputeActiveItems);
