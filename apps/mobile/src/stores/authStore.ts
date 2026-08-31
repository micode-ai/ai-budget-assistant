import { create } from 'zustand';
import { secureStorage } from '../services/secureStorage';
import { api } from '../services/api';
import type { User, Currency, SettleMethod, UserPaymentMethod } from '@budget/shared-types';
import { applyCurrencyChange } from '../utils/currency';
import { applyPaymentInfoPatch, applyPaymentMethodsPatch } from '../utils/paymentInfo';
import type { AuthState } from './authStore.types';
import {
  initializeAction,
  loginAction,
  registerAction,
  googleLoginAction,
  biometricLoginAction,
  logoutAction,
} from './authSessionActions';
import {
  forgotPasswordAction,
  resetPasswordAction,
  verifyEmailAction,
  resendVerificationAction,
} from './authRecoveryActions';

export type { AuthState } from './authStore.types';

/**
 * Thin composition over `authSessionActions.ts` (session lifecycle:
 * initialize/login/register/googleLogin/biometricLogin/logout) and
 * `authRecoveryActions.ts` (password recovery / email verification) —
 * mirrors the `walletStore.ts` split (ABA-447). Each action below is a
 * one-line delegate; `updateUser`/`setCurrency`/`setPaymentInfo`/
 * `setPaymentMethods`/`setTokens`/`clearError` stay here since they already
 * delegate to their own pure-function modules (`utils/currency.ts`,
 * `utils/paymentInfo.ts`) and don't belong to either extracted concern.
 */
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitializing: true,
  isLoading: false,
  error: null,
  hasSavedSession: false,

  initialize: () => initializeAction(set),
  login: (email, password) => loginAction(set, email, password),
  register: (email, password, name, currencyCode, referralCode, language) =>
    registerAction(set, email, password, name, currencyCode, referralCode, language),
  googleLogin: (idToken, language) => googleLoginAction(set, idToken, language),
  biometricLogin: () => biometricLoginAction(set),
  logout: () => logoutAction(set),

  forgotPassword: (email) => forgotPasswordAction(set, email),
  resetPassword: (email, code, newPassword) => resetPasswordAction(set, email, code, newPassword),
  verifyEmail: (email, code) => verifyEmailAction(set, get, email, code),
  resendVerification: (email) => resendVerificationAction(set, email),

  updateUser: (updates: Partial<User>) => {
    const { user } = get();
    if (user) {
      const updatedUser = { ...user, ...updates, updatedAt: new Date() };
      set({ user: updatedUser });
      secureStorage.setItem('user', JSON.stringify(updatedUser));
    }
  },

  setCurrency: (currencyCode: Currency) => {
    const { user, updateUser } = get();
    applyCurrencyChange(currencyCode, {
      currentCurrency: user?.currencyCode,
      applyLocal: (code) => updateUser({ currencyCode: code }),
      persist: (code) => api.updateProfile({ currencyCode: code }),
      onPersistError: (error) =>
        console.warn('Failed to persist currency change:', error),
    });
  },

  setPaymentInfo: (paymentMethod: SettleMethod | null, paymentHandle: string | null) => {
    const { updateUser } = get();
    applyPaymentInfoPatch(
      { paymentMethod, paymentHandle },
      {
        applyLocal: (patch) => updateUser(patch),
        persist: (patch) => api.updateProfile(patch),
        onPersistError: (error) =>
          console.warn('Failed to persist payment info:', error),
      },
    );
  },

  setPaymentMethods: (methods: UserPaymentMethod[]) => {
    const { updateUser } = get();
    applyPaymentMethodsPatch(methods, {
      // The server clears the legacy paymentMethod/paymentHandle pair in the same
      // transaction as this write (see users.service.ts's replacePaymentMethods) —
      // mirror that locally so a stale legacy value can't linger in local state
      // either (the exact trap this feature closes).
      applyLocal: (list) => updateUser({ paymentMethods: list, paymentMethod: null, paymentHandle: null }),
      persist: (list) => api.replacePaymentMethods(list),
      onPersistError: (error) =>
        console.warn('Failed to persist payment methods:', error),
    });
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
