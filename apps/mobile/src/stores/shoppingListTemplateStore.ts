import { create } from 'zustand';
import { api } from '@/services/api';
import type { ShoppingListTemplate, ShoppingListItem } from '@budget/shared-types';

interface ShoppingListTemplateState {
  templates: ShoppingListTemplate[];
  isLoading: boolean;

  loadTemplates: () => Promise<void>;
  /**
   * Saves the given items (typically the currently-active list's items) as a
   * new named template. Returns the created template, or `null` on failure
   * (the caller shows an alert — there is no offline queue for this: unlike
   * list/item writes, which are edited constantly offline at the store,
   * managing templates is rare and there is nothing useful to retry later).
   */
  saveAsTemplate: (
    name: string,
    items: Pick<ShoppingListItem, 'rawLabel' | 'canonicalName'>[],
  ) => Promise<ShoppingListTemplate | null>;
  renameTemplate: (id: string, name: string) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
  /** Merges a template's items into `listId`, skipping duplicates server-side. */
  applyTemplate: (
    id: string,
    listId: string,
  ) => Promise<{ addedCount: number; skippedCount: number } | null>;
  /**
   * Cleared whenever the active account changes (`accountStore`'s
   * `clearAccountScopedCaches`) and on sign-out — templates are
   * account-scoped, and this store has no per-load account guard, so a
   * stale `templates` array would otherwise keep rendering under a
   * different account/user until the next `loadTemplates()` call happens
   * to overwrite it (the same leak class `merchantRulesStore.reset()`
   * documents).
   */
  reset: () => void;
}

export const useShoppingListTemplateStore = create<ShoppingListTemplateState>((set, get) => ({
  templates: [],
  isLoading: false,

  loadTemplates: async () => {
    set({ isLoading: true });
    try {
      const templates = await api.getShoppingListTemplates();
      set({ templates, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      console.warn('Failed to load shopping list templates:', e);
    }
  },

  saveAsTemplate: async (name, items) => {
    try {
      const template = await api.createShoppingListTemplate({
        name,
        items: items.map((it) => ({ rawLabel: it.rawLabel, canonicalName: it.canonicalName })),
      });
      set((s) => ({ templates: [...s.templates, template] }));
      return template;
    } catch (e) {
      console.warn('Failed to save shopping list template:', e);
      return null;
    }
  },

  renameTemplate: async (id, name) => {
    const previous = get().templates;
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
    try {
      await api.renameShoppingListTemplate(id, { name });
      return true;
    } catch (e) {
      console.warn('Failed to rename shopping list template:', e);
      set({ templates: previous });
      return false;
    }
  },

  deleteTemplate: async (id) => {
    const previous = get().templates;
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
    try {
      await api.deleteShoppingListTemplate(id);
      return true;
    } catch (e) {
      console.warn('Failed to delete shopping list template:', e);
      set({ templates: previous });
      return false;
    }
  },

  applyTemplate: async (id, listId) => {
    try {
      const result = await api.applyShoppingListTemplate(id, listId);
      return { addedCount: result.addedLabels.length, skippedCount: result.skippedLabels.length };
    } catch (e) {
      console.warn('Failed to apply shopping list template:', e);
      return null;
    }
  },

  reset: () => set({ templates: [], isLoading: false }),
}));
