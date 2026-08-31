import type { Account } from '@budget/shared-types';
import { httpClient } from './http-client';
import { getAcquisition } from './attribution';

export const authApi = {
  login(email: string, password: string) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      },
    );
  },

  register(email: string, password: string, name: string, currencyCode?: string, referralCode?: string, language?: string) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/register',
      {
        method: 'POST',
        // Attribution is attached HERE, not threaded through authStore.register's
        // already six-positional-argument signature — that way both signup paths pick
        // it up by construction and no future caller can forget it.
        body: JSON.stringify({ email, password, name, currencyCode, referralCode, language, acquisition: getAcquisition() }),
        skipAuth: true,
      },
    );
  },

  loginWithGoogle(idToken: string, language?: string, currencyCode?: string, referralCode?: string) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, language, currencyCode, referralCode, acquisition: getAcquisition() }),
        skipAuth: true,
      },
    );
  },

  forgotPassword(email: string) {
    return httpClient.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  resetPassword(email: string, code: string, newPassword: string) {
    return httpClient.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
      skipAuth: true,
    });
  },

  verifyEmail(email: string, code: string) {
    return httpClient.request<{ message: string; accessToken?: string; refreshToken?: string; user?: any; accounts?: any[] }>(
      '/auth/verify-email',
      {
        method: 'POST',
        body: JSON.stringify({ email, code }),
        skipAuth: true,
      },
    );
  },

  resendVerificationEmail(email: string) {
    return httpClient.request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  changeEmailRequest(dto: { newEmail: string; currentPassword: string }) {
    return httpClient.request<{ message: string }>('/auth/change-email/request', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  changeEmailConfirm(dto: { code: string }) {
    return httpClient.request<{ message: string; accessToken: string; refreshToken: string }>(
      '/auth/change-email/confirm',
      {
        method: 'POST',
        body: JSON.stringify(dto),
      },
    );
  },

  // Restore Credentials (Android "restore from backup" auto sign-in, ABA-465).
  // Registration runs while the user already has a session, so it's authenticated
  // like everything below it. Authentication runs with NO session at all — before
  // login, at app boot — so both of its calls are `skipAuth: true`, same as
  // `login`/`register` above.

  getRestoreRegistrationOptions() {
    return httpClient.request<unknown>('/auth/restore/register/options');
  },

  verifyRestoreRegistration(response: unknown) {
    return httpClient.request<{ ok: boolean }>('/auth/restore/register', {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
  },

  getRestoreAuthenticationOptions() {
    return httpClient.request<unknown>('/auth/restore/options', { skipAuth: true });
  },

  verifyRestoreAuthentication(response: unknown) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/restore',
      {
        method: 'POST',
        body: JSON.stringify({ response }),
        skipAuth: true,
      },
    );
  },

  deleteRestoreCredentials() {
    return httpClient.request<void>('/auth/restore', { method: 'DELETE' });
  },
};
