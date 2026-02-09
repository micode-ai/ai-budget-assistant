import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency } from '@budget/shared-types';
import { useAccountStore } from './accountStore';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
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
      isLoading: true,
      error: null,
      hasSavedSession: false,

      initialize: async () => {
        set({ isLoading: true });
        try {
          const accessToken = await secureStorage.getItem('accessToken');
          const refreshToken = await secureStorage.getItem('refreshToken');
          const userJson = await secureStorage.getItem('user');
          const biometricEnabled = await secureStorage.getItem('biometricEnabled');

          if (accessToken && userJson) {
            if (biometricEnabled === 'true') {
              // Session exists but biometric required — wait for biometric verification
              set({ hasSavedSession: true, isLoading: false });
            } else {
              const user = JSON.parse(userJson) as User;
              set({
                user,
                accessToken,
                refreshToken,
                isAuthenticated: true,
                isLoading: false,
              });
              // Restore account context from local DB
              await useAccountStore.getState().loadAccounts();
            }
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Failed to initialize auth:', error);
          set({ isLoading: false });
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
            isAuthenticated: true,
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
            isAuthenticated: true,
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

          // Set tokens in state so api.request() can use them
          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            hasSavedSession: false,
          });

          // Validate session — getProfile() will trigger token refresh if accessToken is expired
          try {
            const profile = await api.getProfile();
            const updatedUser: User = {
              ...user,
              name: profile.name || user.name,
              currencyCode: (profile.currencyCode || user.currencyCode) as Currency,
            };
            set({ user: updatedUser });
            await secureStorage.setItem('user', JSON.stringify(updatedUser));
            // Restore account context from local DB
            await useAccountStore.getState().loadAccounts();
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

          // Reset account store
          useAccountStore.getState().reset();
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
