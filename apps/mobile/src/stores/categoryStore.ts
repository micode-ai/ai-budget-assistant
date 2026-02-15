import { create } from 'zustand';
import type { Category } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { getAllCategories, upsertCategory } from '@/db/categoryRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#FF6B6B' },
  { name: 'Transport', icon: 'car', color: '#4ECDC4' },
  { name: 'Shopping', icon: 'cart', color: '#45B7D1' },
  { name: 'Entertainment', icon: 'game-controller', color: '#96CEB4' },
  { name: 'Health & Fitness', icon: 'fitness', color: '#FFEAA7' },
  { name: 'Bills & Utilities', icon: 'flash', color: '#DDA0DD' },
  { name: 'Education', icon: 'school', color: '#98D8C8' },
  { name: 'Travel', icon: 'airplane', color: '#F7DC6F' },
  { name: 'Groceries', icon: 'basket', color: '#82E0AA' },
  { name: 'Coffee & Drinks', icon: 'cafe', color: '#D4A574' },
  { name: 'Subscriptions', icon: 'repeat', color: '#BB8FCE' },
  { name: 'Clothing', icon: 'shirt', color: '#F1948A' },
  { name: 'Personal Care', icon: 'happy', color: '#AED6F1' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'cash', color: '#27AE60' },
  { name: 'Freelance', icon: 'laptop', color: '#2ECC71' },
  { name: 'Investments', icon: 'trending-up', color: '#1ABC9C' },
  { name: 'Gifts', icon: 'gift', color: '#E74C3C' },
  { name: 'Other Income', icon: 'ellipsis-horizontal', color: '#95A5A6' },
];

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  isInitialized: boolean;

  loadCategories: () => Promise<void>;
  getCategoryById: (id: string) => Category | undefined;
  getCategoryByName: (name: string, type: 'expense' | 'income') => Category | undefined;
  getExpenseCategories: () => Category[];
  getIncomeCategories: () => Category[];
  createCategory: (name: string, type: 'expense' | 'income', icon?: string, color?: string) => Promise<Category>;
  syncFromServer: (serverCategories: any[]) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  isInitialized: false,

  loadCategories: async () => {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) return;
    set({ isLoading: true });
    try {
      let categories = await getAllCategories(accountId);

      // If local DB is empty, try to fetch from server first
      if (categories.length === 0) {
        try {
          const serverCategories = await api.getCategories();
          if (serverCategories && serverCategories.length > 0) {
            await get().syncFromServer(serverCategories);
            categories = await getAllCategories(accountId);
            setLastSyncTime(Date.now());
          }
        } catch {
          // Server unavailable — will seed defaults below
        }
      }

      // Ensure all default categories exist (check by name to avoid duplicates with server categories)
      const existingNames = new Set(categories.map(c => `${c.type}:${c.name}`));
      let seeded = false;
      const now = new Date();

      for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
        if (!existingNames.has(`expense:${cat.name}`)) {
          const id = `default-exp-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          await upsertCategory({
            id,
            accountId,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            type: 'expense',
            isSystem: true,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          });
          seeded = true;
        }
      }
      for (const cat of DEFAULT_INCOME_CATEGORIES) {
        if (!existingNames.has(`income:${cat.name}`)) {
          const id = `default-inc-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          await upsertCategory({
            id,
            accountId,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            type: 'income',
            isSystem: true,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          });
          seeded = true;
        }
      }

      if (seeded) {
        categories = await getAllCategories(accountId);
      }

      set({ categories, isInitialized: true });
    } finally {
      set({ isLoading: false });
    }
  },

  getCategoryById: (id: string) => {
    return get().categories.find(c => c.id === id);
  },

  getCategoryByName: (name: string, type: 'expense' | 'income') => {
    return get().categories.find(c => c.name === name && c.type === type && !c.isDeleted);
  },

  getExpenseCategories: () => {
    return get().categories.filter(c => c.type === 'expense' && !c.isDeleted);
  },

  getIncomeCategories: () => {
    return get().categories.filter(c => c.type === 'income' && !c.isDeleted);
  },

  createCategory: async (name: string, type: 'expense' | 'income', icon?: string, color?: string) => {
    const accountId = useAccountStore.getState().currentAccountId;
    const userId = useAuthStore.getState().user?.id;
    if (!accountId || !userId) throw new Error('No account or user');

    const now = new Date();
    const id = generateUUID();

    const category: Category = {
      id,
      userId,
      accountId,
      name,
      icon,
      color: color || '#6B7280',
      type,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 0,
    };

    await upsertCategory(category);

    const categories = await getAllCategories(accountId);
    set({ categories });

    // Encrypt sensitive fields before sending to server
    maybeEncrypt('category', { name }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
      api.createCategory({ name: encPayload.name ?? name, icon, color, type, encryptedPayload, encryptionKeyVersion } as any);
    }).catch(() => {});

    return category;
  },

  syncFromServer: async (serverCategories: any[]) => {
    for (const cat of serverCategories) {
      // Decrypt encrypted fields if present
      const decrypted = await maybeDecrypt('category', cat, cat.accountId);

      await upsertCategory({
        id: cat.id,
        userId: cat.userId || undefined,
        accountId: cat.accountId || undefined,
        name: decrypted.name,
        icon: cat.icon || undefined,
        color: cat.color || undefined,
        type: cat.type || 'expense',
        isSystem: cat.isSystem ?? false,
        parentId: cat.parentId || undefined,
        createdAt: new Date(cat.createdAt),
        updatedAt: new Date(cat.updatedAt),
        isDeleted: cat.isDeleted ?? false,
        syncVersion: cat.syncVersion || 0,
      });
    }
    // Reload without recursive fetch
    const accountId = useAccountStore.getState().currentAccountId;
    if (accountId) {
      const categories = await getAllCategories(accountId);
      set({ categories, isInitialized: true });
    }
  },
}));
