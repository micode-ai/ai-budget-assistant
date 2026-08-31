/**
 * authRecoveryActions.ts — password-recovery / email-verification logic
 * (forgotPassword/resetPassword/verifyEmail/resendVerification) extracted
 * from authStore.ts. Functions accept the store's (set, get) as params so
 * they share state without a circular import, mirroring
 * walletBalanceActions.ts / authSessionActions.ts.
 */
import { api } from '../services/api';
import { secureStorage } from '../services/secureStorage';
import type { User, Currency } from '@budget/shared-types';
import { registerRestoreCredential } from '../features/auth/restoreCredential';
import type { AuthStoreSet, AuthStoreGet } from './authStore.types';

export async function forgotPasswordAction(set: AuthStoreSet, email: string): Promise<void> {
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
}

export async function resetPasswordAction(
  set: AuthStoreSet,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
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
}

export async function verifyEmailAction(
  set: AuthStoreSet,
  get: AuthStoreGet,
  email: string,
  code: string,
): Promise<void> {
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
        themeMode: (response.user.themeMode as User['themeMode']) ?? 'system',
        accentColor: (response.user.accentColor as string | null) ?? null,
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
      // Fire-and-forget: sign-in must not wait on Credential Manager. Same
      // relative position (right after biometricEnabled) as loginAction()/
      // googleLoginAction() — see the note in authSessionActions.ts's
      // loginAction().
      void registerRestoreCredential(user.id);

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
}

export async function resendVerificationAction(set: AuthStoreSet, email: string): Promise<void> {
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
}
