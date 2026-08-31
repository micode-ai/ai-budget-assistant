import type { StoreApi } from 'zustand';
import type { User, Currency, SettleMethod, UserPaymentMethod } from '@budget/shared-types';

/**
 * Shared `AuthState` shape, split out so `authSessionActions.ts` and
 * `authRecoveryActions.ts` can import the type without a runtime circular
 * dependency on `authStore.ts` (which imports them for their action bodies).
 */
export interface AuthState {
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
  register: (email: string, password: string, name: string, currencyCode?: string, referralCode?: string, language?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string, language?: string) => Promise<void>;
  biometricLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setCurrency: (currencyCode: Currency) => void;
  setPaymentInfo: (paymentMethod: SettleMethod | null, paymentHandle: string | null) => void;
  setPaymentMethods: (methods: UserPaymentMethod[]) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearError: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
}

export type AuthStoreSet = StoreApi<AuthState>['setState'];
export type AuthStoreGet = StoreApi<AuthState>['getState'];
