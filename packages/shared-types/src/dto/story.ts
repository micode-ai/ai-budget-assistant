import type { SpendingStory } from '../entities';

export interface GenerateStoryRequest {
  period: 'week' | 'month';
  forceRegenerate?: boolean;
}

export interface StoryDashboardResponse {
  story: SpendingStory;
  isStale: boolean;
}
