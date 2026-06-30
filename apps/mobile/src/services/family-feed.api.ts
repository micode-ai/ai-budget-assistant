import type { FeedGroup } from '@budget/shared-types';
import { httpClient } from './http-client';

export const familyFeedApi = {
  getFamilyFeed(limit = 100) {
    return httpClient.request<FeedGroup[]>(`/family-feed?limit=${limit}`);
  },

  reactToFeedEvent(eventId: string, emoji: string) {
    return httpClient.request<void>(`/family-feed/${eventId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  },

  removeFeedReaction(eventId: string) {
    return httpClient.request<void>(`/family-feed/${eventId}/react`, {
      method: 'DELETE',
    });
  },
};
