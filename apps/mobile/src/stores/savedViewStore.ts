import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { generateUUID } from '@budget/shared-utils';
import { parseStoredViews, type SavedView, type SavedViewSnapshot } from '@/features/expenses/savedViews';

/** Free tier cap, same as saved scenarios. */
export const SAVED_VIEW_FREE_LIMIT = 5;
const STORAGE_PREFIX = 'saved_views:';
const mmkv = new MMKV({ id: 'saved-view-storage' });

export function savedViewScopeKey(userId?: string | null, accountId?: string | null): string | null {
  return userId && accountId ? `${userId}:${accountId}` : null;
}

interface SavedViewState {
  views: SavedView[];
  scopeKey: string | null;
  setScope: (userId?: string | null, accountId?: string | null) => void;
  reset: () => void;
  saveView: (name: string, snapshot: SavedViewSnapshot, isPro: boolean) => 'ok' | 'limit_reached' | 'no_scope' | 'empty_name';
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
}

function persist(key: string, views: SavedView[]) {
  mmkv.set(STORAGE_PREFIX + key, JSON.stringify(views));
}

export const useSavedViewStore = create<SavedViewState>()((set, get) => ({
  views: [],
  scopeKey: null,

  setScope: (userId, accountId) => {
    const key = savedViewScopeKey(userId, accountId);
    if (key === get().scopeKey) return;
    set({ scopeKey: key, views: key ? parseStoredViews(mmkv.getString(STORAGE_PREFIX + key)) : [] });
  },

  reset: () => set({ scopeKey: null, views: [] }),

  saveView: (name, snapshot, isPro) => {
    const { views, scopeKey } = get();
    if (!scopeKey) return 'no_scope';
    const trimmed = name.trim();
    if (!trimmed) return 'empty_name';
    if (!isPro && views.length >= SAVED_VIEW_FREE_LIMIT) return 'limit_reached';
    const next = [
      { id: generateUUID(), name: trimmed, createdAt: new Date().toISOString(), ...snapshot },
      ...views,
    ];
    persist(scopeKey, next);
    set({ views: next });
    return 'ok';
  },

  renameView: (id, name) => {
    const { views, scopeKey } = get();
    const trimmed = name.trim();
    if (!scopeKey || !trimmed) return;
    const next = views.map((v) => (v.id === id ? { ...v, name: trimmed } : v));
    persist(scopeKey, next);
    set({ views: next });
  },

  deleteView: (id) => {
    const { views, scopeKey } = get();
    if (!scopeKey) return;
    const next = views.filter((v) => v.id !== id);
    persist(scopeKey, next);
    set({ views: next });
  },
}));
