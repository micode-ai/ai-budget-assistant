import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { getIntlLocale } from '@/i18n';
import { StoryBlockRenderer } from '@/components/story';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { useAiCostConfirmation } from '@/hooks/useAiCostConfirmation';
import type { SpendingStory, StoryBlock } from '@budget/shared-types';

export default function StoryScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const intlLocale = getIntlLocale();

  const params = useLocalSearchParams<{ month?: string; year?: string }>();

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(
    params.month ? Number(params.month) : now.getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState(
    params.year ? Number(params.year) : now.getFullYear(),
  );

  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [story, setStory] = useState<SpendingStory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmAiUsage } = useAiCostConfirmation();

  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const getMonthLabel = (month: number, year: number): string => {
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString(intlLocale, { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
  };

  const goToPrevMonth = useCallback(() => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth, isCurrentMonth]);

  const loadStory = useCallback(
    async (forceRegenerate = false) => {
      const confirmed = await confirmAiUsage('story', 3);
      if (!confirmed) return;
      setIsLoading(true);
      setError(null);
      try {
        const month = period === 'month' ? selectedMonth : undefined;
        const year = period === 'month' ? selectedYear : undefined;
        const response = await api.getSpendingStory(period, forceRegenerate, i18n.language, month, year);
        setStory(response.story);
        useSubscriptionStore.getState().loadUsage();
      } catch (err) {
        if ((err as { status?: number }).status === 403) {
          useUpgradeStore.getState().show(t('subscription.limitReachedBody'), 'pro');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load story');
        }
      } finally {
        setIsLoading(false);
      }
    },
    // confirmAiUsage is stable (no deps), safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, i18n.language, selectedMonth, selectedYear],
  );

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  const handleRegenerate = () => {
    loadStory(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Period Selector */}
      <View style={styles.periodRow}>
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
        <AiUsageBadge />
      </View>

      {/* Month/Year Picker (only for month period) */}
      {period === 'month' && (
        <View style={styles.monthPickerRow}>
          <TouchableOpacity onPress={goToPrevMonth} hitSlop={8} disabled={isLoading}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthPickerLabel}>
            {getMonthLabel(selectedMonth, selectedYear)}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} hitSlop={8} disabled={isCurrentMonth || isLoading}>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={isCurrentMonth ? theme.colors.textDisabled : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      )}

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
  periodRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    gap: theme.spacing[2],
  },
  periodSelector: {
    flex: 1,
    flexDirection: 'row' as const,
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
  monthPickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
  },
  monthPickerLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    minWidth: 160,
    textAlign: 'center' as const,
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
