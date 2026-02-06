import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency } from '@budget/shared-types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
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

      initialize: async () => {
        set({ isLoading: true });
        try {
          const accessToken = await secureStorage.getItem('accessToken');
          const refreshToken = await secureStorage.getItem('refreshToken');
          const userJson = await secureStorage.getItem('user');

          if (accessToken && userJson) {
            const user = JSON.parse(userJson) as User;
            set({
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
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
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register(email, password, name);

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            name: response.user.name,
            currencyCode: (response.user.currencyCode || 'USD') as Currency,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await secureStorage.setItem('accessToken', response.accessToken);
          await secureStorage.setItem('refreshToken', response.refreshToken);
          await secureStorage.setItem('user', JSON.stringify(user));

          set({
            user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await secureStorage.removeItem('accessToken');
          await secureStorage.removeItem('refreshToken');
          await secureStorage.removeItem('user');

          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
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
