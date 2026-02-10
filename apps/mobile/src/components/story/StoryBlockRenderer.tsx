import React from 'react';
import { View } from 'react-native';
import type { StoryBlock } from '@budget/shared-types';
import { StoryHeroMetric } from './StoryHeroMetric';
import { StoryNarrative } from './StoryNarrative';
import { StoryChart } from './StoryChart';
import { StoryComparison } from './StoryComparison';
import { StoryCallout } from './StoryCallout';
import { StoryAchievement } from './StoryAchievement';

interface StoryBlockRendererProps {
  block: StoryBlock;
}

export function StoryBlockRenderer({ block }: StoryBlockRendererProps) {
  const { type, content } = block;

  switch (type) {
    case 'hero_metric':
      return (
        <StoryHeroMetric
          title={content.title}
          metrics={content.metrics ?? []}
          tone={content.tone}
        />
      );

    case 'narrative_text':
      return (
        <StoryNarrative
          text={content.text ?? ''}
          tone={content.tone}
        />
      );

    case 'chart':
      if (!content.chartConfig) return null;
      return (
        <StoryChart
          title={content.title}
          chartConfig={content.chartConfig}
        />
      );

    case 'comparison':
      return (
        <StoryComparison
          title={content.title}
          metrics={content.metrics ?? []}
        />
      );

    case 'callout':
      return (
        <StoryCallout
          title={content.title}
          text={content.text}
          icon={content.icon}
          tone={content.tone}
        />
      );

    case 'achievement':
      return (
        <StoryAchievement
          title={content.title}
          text={content.text}
          icon={content.icon}
        />
      );

    default:
      return <View />;
  }
}
