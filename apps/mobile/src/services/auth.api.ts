import type { Account } from '@budget/shared-types';
import { httpClient } from './http-client';

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
        body: JSON.stringify({ email, password, name, currencyCode, referralCode, language }),
        skipAuth: true,
      },
    );
  },

  loginWithGoogle(idToken: string, language?: string, currencyCode?: string, referralCode?: string) {
    return httpClient.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, language, currencyCode, referralCode }),
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
};
