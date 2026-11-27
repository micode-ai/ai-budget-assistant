import { httpClient } from './http-client';
import type { SendSupportMessageDto, SupportMessageView, SupportThreadView } from '@budget/shared-types';

/**
 * "Write to the developer" (`/support/*`). User-scoped on the server
 * (`JwtAuthGuard` only), so every call passes `skipAccountScope`: no `X-Account-Id`, and it
 * works while a sample-data (demo) account is current.
 * Online-only — a support message is never queued for a later sync; a failed
 * send is reported to the user and the draft stays in the composer.
 */
export const supportApi = {
  /** `before` is the ISO `createdAt` of the oldest message already loaded (not an id). */
  getThread(before?: string, limit?: number) {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return httpClient.request<SupportThreadView>(`/support/thread${query ? `?${query}` : ''}`, {
      skipAccountScope: true,
    });
  },

  send(dto: SendSupportMessageDto) {
    return httpClient.request<SupportMessageView>('/support/messages', {
      method: 'POST',
      body: JSON.stringify(dto),
      skipAccountScope: true,
    });
  },

  markRead() {
    return httpClient.request<void>('/support/thread/read', { method: 'POST', skipAccountScope: true });
  },

  setAutoTranslate(autoTranslate: boolean) {
    return httpClient.request<void>('/support/thread', {
      method: 'PATCH',
      body: JSON.stringify({ autoTranslate }),
      skipAccountScope: true,
    });
  },
};
