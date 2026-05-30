import type { ChartConfig } from './chart';

export type StoryBlockType = 'hero_metric' | 'narrative_text' | 'chart' | 'comparison' | 'callout' | 'achievement';

export interface StoryBlock {
  type: StoryBlockType;
  order: number;
  content: {
    title?: string;
    text?: string;
    chartConfig?: ChartConfig;
    metrics?: Array<{ label: string; value: string; change?: number }>;
    icon?: string;
    tone?: 'positive' | 'neutral' | 'warning' | 'celebration';
  };
}

export interface SpendingStory {
  id: string;
  accountId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  blocks: StoryBlock[];
  summary: string;
  generatedAt: string;
}
