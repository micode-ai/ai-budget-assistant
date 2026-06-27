import type { TelegramLinkCodeResponse, TelegramLinkStatusResponse } from '@budget/shared-types';
import { httpClient } from './http-client';

export const usersApi = {
  getProfile() {
    return httpClient.request<any>('/users/me');
  },

  updateProfile(data: { name?: string; currencyCode?: string; timezone?: string; language?: string }) {
    return httpClient.request<any>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateAiResponseMode(mode: string) {
    return httpClient.request<{ success: boolean; mode: string }>('/users/me/ai-response-mode', {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    });
  },

  updateAiModel(model: string) {
    return httpClient.request<{ success: boolean; model: string }>('/users/me/ai-model', {
      method: 'PATCH',
      body: JSON.stringify({ model }),
    });
  },

  updatePushToken(token: string | null) {
    return httpClient.request<{ success: boolean }>('/users/me/push-token', {
      method: 'PATCH',
      body: JSON.stringify({ pushToken: token }),
    });
  },

  getNotificationPreferences() {
    return httpClient.request<{ budgetAlerts: boolean; sharedAccountActivity: boolean; debtReminders: boolean; recurringExpenses: boolean; subscriptionRenewals: boolean; anomalyAlerts: boolean; trackingGap: boolean }>(
      '/users/me/notification-preferences',
    );
  },

  updateNotificationPreferences(prefs: { budgetAlerts?: boolean; sharedAccountActivity?: boolean; debtReminders?: boolean; recurringExpenses?: boolean; subscriptionRenewals?: boolean; anomalyAlerts?: boolean; trackingGap?: boolean }) {
    return httpClient.request<{ budgetAlerts: boolean; sharedAccountActivity: boolean; debtReminders: boolean; recurringExpenses: boolean; subscriptionRenewals: boolean; anomalyAlerts: boolean; trackingGap: boolean }>(
      '/users/me/notification-preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      },
    );
  },

  generateTelegramLinkCode() {
    return httpClient.request<TelegramLinkCodeResponse>('/users/me/telegram-link-code', {
      method: 'POST',
    });
  },

  getTelegramLinkStatus() {
    return httpClient.request<TelegramLinkStatusResponse>('/users/me/telegram-link');
  },

  unlinkTelegram() {
    return httpClient.request<void>('/users/me/telegram-link', { method: 'DELETE' });
  },

  generateWhatsAppLinkCode(): Promise<{ code: string; expiresAt: string; waPhoneNumber: string }> {
    return httpClient.request<{ code: string; expiresAt: string; waPhoneNumber: string }>(
      '/users/me/whatsapp-link-code',
      { method: 'POST' },
    );
  },

  getWhatsAppLinkStatus(): Promise<{ linked: boolean; waPhoneNumber?: string; waProfileName?: string | null; linkedAt?: string }> {
    return httpClient.request<{ linked: boolean; waPhoneNumber?: string; waProfileName?: string | null; linkedAt?: string }>(
      '/users/me/whatsapp-link',
    );
  },

  unlinkWhatsApp(): Promise<{ success: boolean }> {
    return httpClient.request<{ success: boolean }>('/users/me/whatsapp-link', { method: 'DELETE' });
  },

  generateSlackLinkCode(): Promise<{ code: string; expiresAt: string }> {
    return httpClient.request<{ code: string; expiresAt: string }>(
      '/users/me/slack-link-code',
      { method: 'POST' },
    );
  },

  getSlackLinkStatus(): Promise<{ linked: boolean; slackProfileName?: string; linkedAt?: string }> {
    return httpClient.request<{ linked: boolean; slackProfileName?: string; linkedAt?: string }>(
      '/users/me/slack-link',
    );
  },

  unlinkSlack(): Promise<{ success: boolean }> {
    return httpClient.request<{ success: boolean }>('/users/me/slack-link', { method: 'DELETE' });
  },

  getReferralCode() {
    return httpClient.request<{ code: string }>('/referrals/my-code');
  },

  getReferralStats() {
    return httpClient.request<any>('/referrals/stats');
  },

  getReferralList() {
    return httpClient.request<any[]>('/referrals/list');
  },
};
