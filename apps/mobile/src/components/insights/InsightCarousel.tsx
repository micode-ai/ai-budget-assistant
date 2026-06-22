import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useContentWidth } from '@/hooks/useContentWidth';
import { useTheme, useStyles, type Theme } from '@/theme';
import { InsightCard } from './InsightCard';
import type { AIInsightChart } from '@budget/shared-types';

interface InsightCarouselProps {
  insights: AIInsightChart[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
}

export function InsightCarousel({ insights, isLoading, onDismiss }: InsightCarouselProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const windowWidth = useContentWidth();
  const [activeIndex, setActiveIndex] = useState(0);

  // scrollContent paddingHorizontal (8) + card marginHorizontal (8) = 16px each side
  const cardWidth = windowWidth - 32;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / cardWidth);
      setActiveIndex(Math.max(0, Math.min(index, insights.length - 1)));
    },
    [cardWidth, insights.length],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Generating insights...</Text>
      </View>
    );
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={cardWidth + 16} // card width + gap
        snapToAlignment="center"
        contentContainerStyle={styles.scrollContent}
      >
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            width={cardWidth}
            onDismiss={onDismiss}
          />
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {insights.length > 1 && (
        <View style={styles.dotsContainer}>
          {insights.map((insight, index) => (
            <View
              key={`dot-${insight.id}`}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === activeIndex
                      ? theme.colors.primary
                      : theme.colors.progressTrack,
                  width: index === activeIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    marginVertical: theme.spacing[3],
    marginHorizontal: -theme.spacing[4],
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    alignItems: 'flex-start' as const,
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[2],
  },
  loadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  dotsContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  dot: {
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
});
