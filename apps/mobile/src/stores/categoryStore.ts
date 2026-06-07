import { create } from 'zustand';
import type { Category } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { getAllCategories, upsertCategory, deleteCategory as deleteCategoryFromDb, categoryExistsById } from '@/db/categoryRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';

// Accounts whose default categories have been seeded and color-patched in this
// session. Avoids re-running 18 sequential `categoryExistsById` SELECTs + a
// color-patch loop on every `loadCategories` call (used to cost 60-600ms each).
const _seededAccounts = new Set<string>();

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#E53E3E' },
  { name: 'Transport', icon: 'car', color: '#2C9E96' },
  { name: 'Shopping', icon: 'cart', color: '#2B8ABD' },
  { name: 'Entertainment', icon: 'game-controller', color: '#3A8C6E' },
  { name: 'Health & Fitness', icon: 'fitness', color: '#D4A017' },
  { name: 'Bills & Utilities', icon: 'flash', color: '#9B59B6' },
  { name: 'Education', icon: 'school', color: '#1A8C76' },
  { name: 'Travel', icon: 'airplane', color: '#B8860B' },
  { name: 'Groceries', icon: 'basket', color: '#27AE60' },
  { name: 'Coffee & Drinks', icon: 'cafe', color: '#A0522D' },
  { name: 'Subscriptions', icon: 'repeat', color: '#7D3C98' },
  { name: 'Clothing', icon: 'shirt', color: '#C0392B' },
  { name: 'Personal Care', icon: 'happy', color: '#2471A3' },
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
  deleteCategory: (id: string) => Promise<void>;
  updateCategory: (id: string, data: { name?: string; color?: string }) => Promise<void>;
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
      // Fast path: this account was already seeded + color-patched in this
      // session. Skip the 18 categoryExistsById SELECTs + color-patch loop and
      // just re-read from SQLite (which the caller wants because the cascade
      // upstream may have upserted new server categories).
      if (_seededAccounts.has(accountId)) {
        const categories = await getAllCategories(accountId);
        set({ categories, isInitialized: true });
        return;
      }

      let categories = await getAllCategories(accountId);

      // If local DB is empty, try to fetch from server first
      if (categories.length === 0) {
        try {
          const serverCategories = await api.getCategories();
          if (serverCategories && serverCategories.length > 0) {
            await get().syncFromServer(serverCategories);
            categories = await getAllCategories(accountId);
            setLastSyncTime(Date.now());
            // Web (no real SQLite): syncFromServer already set state from built
            // server rows; the local read-back is empty and the native seeding /
            // color-patch below would clobber it back to empty. Keep them and stop.
            // (Don't mark _seededAccounts so later loads re-fetch from server.)
            if (categories.length === 0 && get().categories.length > 0) {
              set({ isInitialized: true });
              return;
            }
          }
        } catch {
          // Server unavailable — will seed defaults below
        }
      }

      // Ensure all default categories exist (check by deterministic ID to avoid re-creating deleted system categories)
      let seeded = false;
      const now = new Date();

      for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
        const id = `default-exp-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        const exists = await categoryExistsById(id);
        if (!exists) {
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
        const id = `default-inc-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        const exists = await categoryExistsById(id);
        if (!exists) {
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

      // Patch categories that are missing a color (e.g. synced from server without color)
      const colorMap = new Map<string, string>([
        ...DEFAULT_EXPENSE_CATEGORIES.map(c => [`expense:${c.name}`, c.color] as [string, string]),
        ...DEFAULT_INCOME_CATEGORIES.map(c => [`income:${c.name}`, c.color] as [string, string]),
      ]);
      let patched = false;
      for (const cat of categories) {
        if (!cat.color) {
          const fallback = colorMap.get(`${cat.type}:${cat.name}`);
          if (fallback) {
            await upsertCategory({ ...cat, color: fallback });
            cat.color = fallback;
            patched = true;
          }
        }
      }
      if (patched) {
        categories = await getAllCategories(accountId);
      }

      _seededAccounts.add(accountId);
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
    // Collect the built rows so web (no real SQLite) can fall back to them when
    // the post-upsert read-back is empty.
    const built: Category[] = [];
    for (const cat of serverCategories) {
      // Decrypt encrypted fields if present
      const decrypted = await maybeDecrypt('category', cat, cat.accountId);

      const entity: Category = {
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
      };
      await upsertCategory(entity);
      if (!entity.isDeleted) built.push(entity);
    }
    // Reload without recursive fetch
    const accountId = useAccountStore.getState().currentAccountId;
    if (accountId) {
      const categories = await getAllCategories(accountId);
      // Web (no real SQLite): read-back is empty — fall back to built rows.
      set({ categories: categories.length > 0 ? categories : built, isInitialized: true });
    }
  },

  deleteCategory: async (id: string) => {
    // Await API — may throw 409 with details (error.status and error.details preserved by api.ts)
    // 404 means category exists only locally (e.g. seeded default with local ID) — delete locally only
    try {
      await api.deleteCategory(id);
    } catch (error: any) {
      if (error?.status !== 404) throw error;
    }
    await deleteCategoryFromDb(id);
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
    }));
  },

  updateCategory: async (id: string, data: { name?: string; color?: string }) => {
    await api.updateCategory(id, data);
    await upsertCategory({
      ...get().categories.find((c) => c.id === id)!,
      ...data,
      updatedAt: new Date(),
    });
    const accountId = useAccountStore.getState().currentAccountId;
    if (accountId) {
      const categories = await getAllCategories(accountId);
      set({ categories });
    }
  },
}));
