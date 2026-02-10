import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { StoryBlockRenderer } from '@/components/story';
import type { SpendingStory, StoryBlock } from '@budget/shared-types';

export default function StoryScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [story, setStory] = useState<SpendingStory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStory = useCallback(
    async (forceRegenerate = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.getSpendingStory(period, forceRegenerate, i18n.language);
        setStory(response.story);
        setIsStale(response.isStale);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load story');
      } finally {
        setIsLoading(false);
      }
    },
    [period],
  );

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  const handleRegenerate = () => {
    loadStory(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodTab, period === 'week' && styles.periodTabActive]}
          onPress={() => setPeriod('week')}
        >
          <Text style={[styles.periodTabText, period === 'week' && styles.periodTabTextActive]}>
            {t('story.week')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodTab, period === 'month' && styles.periodTabActive]}
          onPress={() => setPeriod('month')}
        >
          <Text style={[styles.periodTabText, period === 'month' && styles.periodTabTextActive]}>
            {t('story.month')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('story.generating')}</Text>
        </View>
      )}

      {/* Error */}
      {!isLoading && error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadStory()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Story Content */}
      {!isLoading && !error && story && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.periodLabel}>{story.periodLabel}</Text>
            {story.summary ? (
              <Text style={styles.summary}>{story.summary}</Text>
            ) : null}
          </View>

          {/* Story Blocks */}
          {(story.blocks as StoryBlock[])
            .sort((a, b) => a.order - b.order)
            .map((block, index) => (
              <View key={index} style={styles.blockWrapper}>
                <StoryBlockRenderer block={block} />
              </View>
            ))}

          {/* Footer */}
          <View style={styles.footer}>
            {story.generatedAt && (
              <Text style={styles.generatedAt}>
                {t('story.lastUpdated', {
                  time: new Date(story.generatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </Text>
            )}

            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerate}>
                <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.regenerateText}>{t('story.regenerate')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* No Data */}
      {!isLoading && !error && story && story.blocks.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>{t('story.noData')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
  },
  periodTab: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  periodTabActive: {
    backgroundColor: theme.colors.primary,
  },
  periodTabText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  periodTabTextActive: {
    color: theme.colors.textInverse,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  loadingText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  errorText: {
    ...theme.textStyles.body,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  retryButton: {
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  header: {
    marginBottom: theme.spacing[4],
  },
  periodLabel: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  summary: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  blockWrapper: {
    marginBottom: theme.spacing[3],
  },
  footer: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  generatedAt: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  footerActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  regenerateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  regenerateText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
