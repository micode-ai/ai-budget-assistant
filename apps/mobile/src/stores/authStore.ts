import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency } from '@budget/shared-types';
import { useAccountStore } from './accountStore';
import { useBudgetStore } from './budgetStore';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';
import { hydrateTransactions } from './hydrateTransactions';
import { useCategoryStore } from './categoryStore';
import { useWalletStore } from './walletStore';
import { useExchangeRateStore } from './exchangeRateStore';
import { useInvestmentStore } from './investmentStore';
import { useInsightsStore } from './insightsStore';
import { useGoalStore } from './goalStore';
import * as investmentRepo from '../db/investmentRepository';

let isLoggingOut = false;

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
  register: (email: string, password: string, name: string, currencyCode?: string, referralCode?: string, language?: string) => Promise<void>;
  biometricLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearError: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
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
            // Parse stored user so we can gate biometric on verification status
            let storedUser: User | null = null;
            try {
              storedUser = JSON.parse(userJson) as User;
            } catch {
              storedUser = null;
            }

            // Only gate behind biometric if the user has verified their email.
            // Unverified sessions should go straight through so the user can
            // reach the verify-email screen without a fingerprint prompt.
            if (biometricEnabled === 'true' && storedUser?.isVerified) {
              // Session exists but biometric required — wait for biometric verification
              set({ hasSavedSession: true, isInitializing: false });
            } else if (storedUser) {
              const user = storedUser;
              set({
                user,
                accessToken,
                refreshToken,
                isAuthenticated: !!user.isVerified,
                isInitializing: false,
              });
              // Restore account context from local DB
              await useAccountStore.getState().loadAccounts();
              // Load exchange rates first so baseCurrency is set before
              // expense/income totals are computed by subscribers
              await useExchangeRateStore.getState().loadRates();
              // Load remaining data. hydrateTransactions serializes expense→income
              // to avoid SQLite contention; other stores run in parallel to it.
              await Promise.allSettled([
                hydrateTransactions(),
                useCategoryStore.getState().loadCategories(),
                useWalletStore.getState().loadWallet(),
                useBudgetStore.getState().loadBudgets(),
              ]);
            } else {
              // Stored user data was corrupted — treat as logged out
              set({ isInitializing: false });
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
            isVerified: !!response.user.isVerified,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));
          // Only enable biometric for verified users — unverified users
          // must reach the verify-email screen without a fingerprint prompt.
          if (user.isVerified) {
            await secureStorage.setItem('biometricEnabled', 'true');
          }

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
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
            if (profile.isAdmin || profile.aiResponseMode || profile.aiModel) {
              const updatedUser = { ...user, isAdmin: profile.isAdmin, aiResponseMode: profile.aiResponseMode || 'balanced', aiModel: profile.aiModel || 'balanced' };
              set({ user: updatedUser });
              await secureStorage.setItem('user', JSON.stringify(updatedUser));
            }
          } catch { /* non-critical */ }

          // Load exchange rates first so baseCurrency is set before
          // expense/income totals are computed by subscribers
          await useExchangeRateStore.getState().loadRates();

          // Load remaining data for the new user's account.
          await Promise.allSettled([
            hydrateTransactions(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);

          // Mark as authenticated only after all data is ready so the
          // dashboard mounts with data already in the stores. Keep isLoading
          // true through the entire flow so the login UI keeps showing the
          // loader until navigation actually happens.
          set({ isAuthenticated: user.isVerified, isLoading: false });
        } catch (error) {
          // Network error — try offline login with cached session
          const isNetworkError = error instanceof TypeError
            || (error instanceof Error && (
              error.message === 'Network request failed'
              || error.message.includes('fetch')
            ));

          if (isNetworkError) {
            const cachedUserJson = await secureStorage.getItem('user');
            const cachedToken = await secureStorage.getItem('accessToken');
            if (cachedUserJson && cachedToken) {
              const cachedUser = JSON.parse(cachedUserJson) as User;
              // Only allow offline login if email matches
              if (cachedUser.email === email) {
                set({
                  user: cachedUser,
                  accessToken: cachedToken,
                  refreshToken: await secureStorage.getItem('refreshToken'),
                  hasSavedSession: false,
                });
                await useAccountStore.getState().loadAccounts();
                await useExchangeRateStore.getState().loadRates();
                await Promise.allSettled([
                  hydrateTransactions(),
                  useCategoryStore.getState().loadCategories(),
                  useWalletStore.getState().loadWallet(),
                  useBudgetStore.getState().loadBudgets(),
                ]);
                set({ isAuthenticated: true, isLoading: false });
                return;
              }
            }
          }

          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string, currencyCode?: string, referralCode?: string, language?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register(email, password, name, currencyCode, referralCode, language);

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            name: response.user.name,
            currencyCode: (response.user.currencyCode || 'USD') as Currency,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            defaultAccountId: response.user.defaultAccountId,
            isVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));
          // Clear biometricEnabled from any previous session so the login
          // screen does not auto-prompt fingerprint during verify-email flow.
          // It will be re-enabled after successful email verification.
          await secureStorage.removeItem('biometricEnabled');

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
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

          // Load remaining data for the new user's account.
          await Promise.allSettled([
            hydrateTransactions(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);

          // Mark as authenticated only after all data is ready so the
          // dashboard mounts with data already in the stores. Keep isLoading
          // true through the entire flow so the registration UI keeps
          // showing the loader until navigation actually happens.
          set({ isAuthenticated: user.isVerified, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      biometricLogin: async () => {
        set({ isLoading: true, error: null });
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
              aiResponseMode: profile.aiResponseMode || 'balanced',
              aiModel: profile.aiModel || 'balanced',
            };
            set({ user: updatedUser });
            await secureStorage.setItem('user', JSON.stringify(updatedUser));
          } catch (profileError: any) {
            // Network error — allow offline login with cached data
            const isNetworkError = profileError?.message === 'Network request failed'
              || profileError?.message?.includes('fetch')
              || profileError?.name === 'TypeError';
            if (!isNetworkError) {
              // Tokens are invalid (401) — need full re-login
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
            // Network error — proceed with cached user data
          }

          // Restore account context from local DB
          await useAccountStore.getState().loadAccounts();
          // Load exchange rates first so baseCurrency is set before
          // expense/income totals are computed by subscribers
          await useExchangeRateStore.getState().loadRates();
          // Load data for the user's account.
          await Promise.allSettled([
            hydrateTransactions(),
            useCategoryStore.getState().loadCategories(),
            useWalletStore.getState().loadWallet(),
            useBudgetStore.getState().loadBudgets(),
          ]);
          // Mark as authenticated only after all data is ready
          set({ isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Biometric login failed',
            hasSavedSession: false,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        if (isLoggingOut) return;
        isLoggingOut = true;
        try {
          // Clear push token from server before clearing auth state,
          // but only if we still have a valid token (skip when called
          // from a 401 cascade where tokens are already removed).
          const currentToken = await secureStorage.getItem('accessToken');
          if (currentToken) {
            try {
              const { unregisterPushNotifications } = await import('../services/notifications');
              await unregisterPushNotifications();
            } catch {
              // Non-critical — server token will expire naturally
            }
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
          useInsightsStore.getState().reset();
          useGoalStore.getState().reset();

          // Clear investment data from SQLite
          await investmentRepo.clearAllInvestments();
        } catch (error) {
          console.error('Failed to logout:', error);
        } finally {
          isLoggingOut = false;
        }
      },

      forgotPassword: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.forgotPassword(email);
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to send reset code',
            isLoading: false,
          });
          throw error;
        }
      },

      verifyEmail: async (email: string, code: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.verifyEmail(email, code);
          if (response.accessToken && response.user) {
            const user: User = {
              id: response.user.id,
              email: response.user.email,
              name: response.user.name,
              currencyCode: (response.user.currencyCode || 'USD') as Currency,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              defaultAccountId: response.user.defaultAccountId,
              isVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            set({
              user,
              accessToken: response.accessToken,
              refreshToken: response.refreshToken,
              isAuthenticated: true,
            });
            await secureStorage.setItem('accessToken', response.accessToken);
            if (response.refreshToken) {
              await secureStorage.setItem('refreshToken', response.refreshToken);
            }
            await secureStorage.setItem('user', JSON.stringify(user));
            await secureStorage.setItem('biometricEnabled', 'true');

            // Initialize account store so dashboard loads correctly
            if (response.accounts) {
              const { useAccountStore } = require('@/stores/accountStore');
              await useAccountStore.getState().initialize(
                response.accounts,
                response.user.defaultAccountId || '',
                response.user.id,
              );
            }
          } else {
            const { user } = get();
            if (user) {
              const updatedUser = { ...user, isVerified: true };
              set({ user: updatedUser, isAuthenticated: true });
              await secureStorage.setItem('user', JSON.stringify(updatedUser));
            }
          }
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Verification failed',
            isLoading: false,
          });
          throw error;
        }
      },

      resendVerification: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.resendVerificationEmail(email);
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to resend code',
            isLoading: false,
          });
          throw error;
        }
      },

      resetPassword: async (email: string, code: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.resetPassword(email, code, newPassword);
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Password reset failed',
            isLoading: false,
          });
          throw error;
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
