import type { SpendingStory } from '../entities';

export interface GenerateStoryRequest {
  period: 'week' | 'month';
  forceRegenerate?: boolean;
}

export interface StoryDashboardResponse {
  story: SpendingStory;
  isStale: boolean;
  /** True when some amounts were FX-converted into the story currency at today's rate. */
  fxConverted?: boolean;
  /** True when some amounts were excluded because no exchange rate was available. */
  fxApproximate?: boolean;
}
