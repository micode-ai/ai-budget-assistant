import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import type { Tag } from '@budget/shared-types';
import * as tagRepo from '@/db/tagRepository';
import { useAccountStore } from './accountStore';
import { api } from '@/services/api';

interface TagState {
  tags: Tag[];
  isLoading: boolean;

  loadTags: () => Promise<void>;
  createTag: (name: string, color?: string, icon?: string) => Promise<Tag>;
  updateTag: (id: string, updates: { name?: string; color?: string; icon?: string }) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  searchTags: (query: string) => Tag[];
  getMostUsedTags: (limit?: number) => Tag[];
  addTagToExpense: (tagId: string, expenseId: string) => Promise<void>;
  removeTagFromExpense: (tagId: string, expenseId: string) => Promise<void>;
  getTagsForExpense: (expenseId: string) => Promise<Tag[]>;
  syncFromServer: (serverTags: any[]) => Promise<void>;
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  isLoading: false,

  loadTags: async () => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    set({ isLoading: true });
    try {
      const tags = await tagRepo.getAllTags(accountId);
      set({ tags });
      // Fire-and-forget: fetch from server
      api.getTags().then(serverTags => {
        if (serverTags) get().syncFromServer(serverTags);
      }).catch(() => {});
    } finally {
      set({ isLoading: false });
    }
  },

  createTag: async (name: string, color?: string, icon?: string) => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) throw new Error('No account');
    const now = new Date();
    const id = randomUUID();
    const tag: Tag = {
      id,
      accountId,
      name,
      color: color || undefined,
      icon: icon || undefined,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncStatus: 'pending',
      syncVersion: 0,
    };
    await tagRepo.insertTag(tag);
    set({ tags: [...get().tags, tag] });
    // Fire-and-forget: sync to server
    api.createTag({ name, color, icon }).catch(() => {});
    return tag;
  },

  updateTag: async (id: string, updates: { name?: string; color?: string; icon?: string }) => {
    const tag = get().tags.find(t => t.id === id);
    if (!tag) return;
    const updated = { ...tag, ...updates, updatedAt: new Date() };
    await tagRepo.upsertTag(updated);
    set({ tags: get().tags.map(t => t.id === id ? updated : t) });
    api.updateTag(id, updates).catch(() => {});
  },

  deleteTag: async (id: string) => {
    await tagRepo.deleteTag(id);
    set({ tags: get().tags.filter(t => t.id !== id) });
    api.deleteTag(id).catch(() => {});
  },

  searchTags: (query: string) => {
    const q = query.toLowerCase();
    return get().tags.filter(t => t.name.toLowerCase().includes(q));
  },

  getMostUsedTags: (limit = 10) => {
    return [...get().tags].sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  },

  addTagToExpense: async (tagId: string, expenseId: string) => {
    const now = new Date();
    const id = randomUUID();
    await tagRepo.insertExpenseTag({
      id,
      expenseId,
      tagId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 0,
    });
  },

  removeTagFromExpense: async (tagId: string, expenseId: string) => {
    await tagRepo.removeExpenseTag(expenseId, tagId);
  },

  getTagsForExpense: async (expenseId: string) => {
    return await tagRepo.getTagsForExpense(expenseId);
  },

  syncFromServer: async (serverTags: any[]) => {
    for (const tag of serverTags) {
      await tagRepo.upsertTag({
        id: tag.id,
        accountId: tag.accountId,
        name: tag.name,
        color: tag.color || undefined,
        icon: tag.icon || undefined,
        usageCount: tag.usageCount || 0,
        createdAt: new Date(tag.createdAt),
        updatedAt: new Date(tag.updatedAt),
        isDeleted: tag.isDeleted ?? false,
        syncStatus: 'synced',
        syncVersion: tag.syncVersion || 0,
      });
    }
    // Reload from local DB only (don't call loadTags to avoid infinite loop)
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    const tags = await tagRepo.getAllTags(accountId);
    set({ tags });
  },
}));
