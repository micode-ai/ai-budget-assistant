import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency } from '@budget/shared-types';
import { useAccountStore } from './accountStore';
import { useBudgetStore } from './budgetStore';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';
import { useCategoryStore } from './categoryStore';
import { useWalletStore } from './walletStore';
import { useExchangeRateStore } from './exchangeRateStore';
import { useInvestmentStore } from './investmentStore';
import * as investmentRepo from '../db/investmentRepository';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoading: boolean;
  error: string | null;
  hasSavedSession: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, currencyCode?: string) => Promise<void>;
  biometricLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitializing: true,
      isLoading: false,
      error: null,
      hasSavedSession: false,

      initialize: async () => {
        set({ isInitializing: true });
        try {
          const accessToken = await secureStorage.getItem('accessToken');
          const refreshToken = await secureStorage.getItem('refreshToken');
          const userJson = await secureStorage.getItem('user');
          const biometricEnabled = await secureStorage.getItem('biometricEnabled');

          if (accessToken && userJson) {
            if (biometricEnabled === 'true') {
              // Session exists but biometric required — wait for biometric verification
              set({ hasSavedSession: true, isInitializing: false });
            } else {
              const user = JSON.parse(userJson) as User;
              set({
                user,
                accessToken,
                refreshToken,
                isAuthenticated: true,
                isInitializing: false,
              });
              // Restore account context from local DB
              await useAccountStore.getState().loadAccounts();
              // Load exchange rates first so baseCurrency is set before
              // expense/income totals are computed by subscribers
              await useExchangeRateStore.getState().loadRates();
              // Load remaining data for the user's account
              await Promise.allSettled([
                useExpenseStore.getState().loadExpenses(),
                useIncomeStore.getState().loadIncomes(),
                useCategoryStore.getState().loadCategories(),
                useWalletStore.getState().loadWallet(),
                useBudgetStore.getState().loadBudgets(),
              ]);
            }
          } else {
            set({ isInitializing: false });
          }
        } catch (error) {
          console.error('Failed to initialize auth:', error);
          set({ isInitializing: false });
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(email, password);

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            name: response.user.name,
            currencyCode: (response.user.currencyCode || 'USD') as Currency,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            defaultAccountId: response.user.defaultAccountId,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));
          // Auto-enable biometric for next login
          await secureStorage.setItem('biometricEnabled', 'true');

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isLoading: false,
            hasSavedSession: false,
          });

          // Initialize account store with accounts from auth response
          if (response.accounts) {
            await useAccountStore.getState().initialize(
              response.accounts,
              response.user.defaultAccountId || '',
              user.id,
            );
          }

          // Fetch profile to get isAdmin flag
          try {
            const profile = await api.getProfile();
            if (profile.isAdmin) {
              const updatedUser = { ...user, isAdmin: profile.isAdmin };
              set({ user: updatedUser });
              await secureStorage.setItem('user', JSON.stringify(updatedUser));
            }
          } catch { /* non-critical */ }

          // Load exchange rates first so baseCurrency is set before
          // expense/income totals are computed by subscribers
          await useExchangeRateStore.getState().loadRates();

          // Load remaining data for the new user's account
          await Promise.allSettled([
            useExpenseStore.getState().loadExpenses(),
            useIncomeStore.getState().loadIncomes(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);

          // Mark as authenticated only after all data is ready so the
          // dashboard mounts with data already in the stores
          set({ isAuthenticated: true });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string, currencyCode?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register(email, password, name, currencyCode);

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            name: response.user.name,
            currencyCode: (response.user.currencyCode || 'USD') as Currency,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            defaultAccountId: response.user.defaultAccountId,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));
          // Auto-enable biometric for next login
          await secureStorage.setItem('biometricEnabled', 'true');

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isLoading: false,
            hasSavedSession: false,
          });

          // Initialize account store with accounts from auth response
          if (response.accounts) {
            await useAccountStore.getState().initialize(
              response.accounts,
              response.user.defaultAccountId || '',
              user.id,
            );
          }

          // Load exchange rates first so baseCurrency is set before
          // expense/income totals are computed by subscribers
          await useExchangeRateStore.getState().loadRates();

          // Load remaining data for the new user's account
          await Promise.allSettled([
            useExpenseStore.getState().loadExpenses(),
            useIncomeStore.getState().loadIncomes(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);

          // Mark as authenticated only after all data is ready so the
          // dashboard mounts with data already in the stores
          set({ isAuthenticated: true });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      biometricLogin: async () => {
        try {
          const accessToken = await secureStorage.getItem('accessToken');
          const refreshToken = await secureStorage.getItem('refreshToken');
          const userJson = await secureStorage.getItem('user');

          if (!accessToken || !userJson) {
            throw new Error('No saved session found');
          }

          const user = JSON.parse(userJson) as User;

          // Set tokens in state so api.request() can use them (not authenticated yet)
          set({
            user,
            accessToken,
            refreshToken,
            hasSavedSession: false,
          });

          // Validate session — getProfile() will trigger token refresh if accessToken is expired
          try {
            const profile = await api.getProfile();
            const updatedUser: User = {
              ...user,
              name: profile.name || user.name,
              currencyCode: (profile.currencyCode || user.currencyCode) as Currency,
              isAdmin: profile.isAdmin,
            };
            set({ user: updatedUser });
            await secureStorage.setItem('user', JSON.stringify(updatedUser));
            // Restore account context from local DB
            await useAccountStore.getState().loadAccounts();
            // Load exchange rates first so baseCurrency is set before
            // expense/income totals are computed by subscribers
            await useExchangeRateStore.getState().loadRates();
            // Load data for the user's account
            await Promise.allSettled([
              useExpenseStore.getState().loadExpenses(),
              useIncomeStore.getState().loadIncomes(),
              useCategoryStore.getState().loadCategories(),
              useWalletStore.getState().loadWallet(),
              useBudgetStore.getState().loadBudgets(),
            ]);
            // Mark as authenticated only after all data is ready
            set({ isAuthenticated: true });
          } catch {
            // Tokens are invalid and refresh also failed — need full re-login
            await secureStorage.removeItem('accessToken');
            await secureStorage.removeItem('refreshToken');
            await secureStorage.removeItem('user');
            await secureStorage.removeItem('biometricEnabled');
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              hasSavedSession: false,
            });
            throw new Error('Session expired, please login again');
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Biometric login failed',
            hasSavedSession: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          // Clear push token from server before clearing auth state
          try {
            const { unregisterPushNotifications } = await import('../services/notifications');
            await unregisterPushNotifications();
          } catch (e) {
            console.error('Failed to clear push token:', e);
          }

          const biometricEnabled = await secureStorage.getItem('biometricEnabled');

          if (biometricEnabled === 'true') {
            // Keep tokens in storage for biometric re-login
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              hasSavedSession: true,
            });
          } else {
            await secureStorage.removeItem('accessToken');
            await secureStorage.removeItem('refreshToken');
            await secureStorage.removeItem('user');
            await secureStorage.removeItem('currentAccountId');

            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              hasSavedSession: false,
            });
          }

          // Reset stores
          useAccountStore.getState().reset();
          useBudgetStore.getState().reset();
          useExpenseStore.getState().reset();
          useIncomeStore.getState().reset();
          useWalletStore.getState().reset();
          useExchangeRateStore.getState().reset();
          useInvestmentStore.getState().reset();

          // Clear investment data from SQLite
          await investmentRepo.clearAllInvestments();
        } catch (error) {
          console.error('Failed to logout:', error);
        }
      },

      updateUser: (updates: Partial<User>) => {
        const { user } = get();
        if (user) {
          const updatedUser = { ...user, ...updates, updatedAt: new Date() };
          set({ user: updatedUser });
          secureStorage.setItem('user', JSON.stringify(updatedUser));
        }
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken });
        secureStorage.setItem('accessToken', accessToken);
        secureStorage.setItem('refreshToken', refreshToken);
      },

      clearError: () => set({ error: null }),
    }));

// Wire up logout handler for API client (avoids circular import: authStore → accountStore → api → authStore)
api.setLogoutHandler(() => useAuthStore.getState().logout());
