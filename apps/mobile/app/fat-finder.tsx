import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInsightsStore } from '@/stores/insightsStore';
import { useAuthStore } from '@/stores/authStore';
import { useAiCostConfirmation } from '@/hooks/useAiCostConfirmation';
import { getIntlLocale } from '@/i18n';
import type { Currency } from '@budget/shared-types';
import { useAccountStore } from '@/stores/accountStore';
import { MonthPicker } from '@/components/fat-finder/MonthPicker';
import { FatFinderHeader } from '@/components/fat-finder/FatFinderHeader';
import { FatFinderFooter } from '@/components/fat-finder/FatFinderFooter';
import { FindingCard } from '@/components/fat-finder/FindingCard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FatFinderScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();

  const canEdit = useAccountStore((s) => s.canEdit());
  const fatFinderReport = useInsightsStore((s) => s.fatFinderReport);
  const fatFinderLoading = useInsightsStore((s) => s.fatFinderLoading);
  const fatFinderError = useInsightsStore((s) => s.fatFinderError);
  const loadFatFinder = useInsightsStore((s) => s.loadFatFinder);
  const fatFinderMonth = useInsightsStore((s) => s.fatFinderMonth);
  const fatFinderYear = useInsightsStore((s) => s.fatFinderYear);

  const { confirmAiUsage } = useAiCostConfirmation();

  useEffect(() => {
    const init = async () => {
      if (!fatFinderReport && !fatFinderLoading) {
        const confirmed = await confirmAiUsage('fat_finder', 3);
        if (confirmed) {
          loadFatFinder(i18n.language, false, fatFinderMonth, fatFinderYear);
        }
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const isCurrentMonth = fatFinderMonth === now.getMonth() + 1 && fatFinderYear === now.getFullYear();
  const intlLocale = getIntlLocale();

  const goToPrevMonth = useCallback(() => {
    let newMonth = fatFinderMonth - 1;
    let newYear = fatFinderYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    loadFatFinder(i18n.language, false, newMonth, newYear);
  }, [fatFinderMonth, fatFinderYear, i18n.language, loadFatFinder]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    let newMonth = fatFinderMonth + 1;
    let newYear = fatFinderYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    loadFatFinder(i18n.language, false, newMonth, newYear);
  }, [fatFinderMonth, fatFinderYear, isCurrentMonth, i18n.language, loadFatFinder]);

  const currency = (fatFinderReport?.currencyCode || user?.currencyCode || 'USD') as Currency;

  const handleRegenerate = async () => {
    const confirmed = await confirmAiUsage('fat_finder', 3);
    if (!confirmed) return;
    loadFatFinder(i18n.language, true, fatFinderMonth, fatFinderYear);
  };

  const monthPickerProps = {
    month: fatFinderMonth,
    year: fatFinderYear,
    isCurrentMonth,
    loading: fatFinderLoading,
    intlLocale,
    onPrev: goToPrevMonth,
    onNext: goToNextMonth,
  };

  // Loading state
  if (fatFinderLoading && !fatFinderReport) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.listContent}>
          <MonthPicker {...monthPickerProps} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('fatFinder.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (fatFinderError && !fatFinderReport) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.listContent}>
          <MonthPicker {...monthPickerProps} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
          <Text style={styles.errorText}>{fatFinderError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadFatFinder(i18n.language, false, fatFinderMonth, fatFinderYear)}
          >
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!fatFinderReport || fatFinderReport.findings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.listContent}>
          <MonthPicker {...monthPickerProps} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} />
          <Text style={styles.emptyTitle}>{t('fatFinder.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('fatFinder.emptyDescription')}</Text>
          <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerate}>
            <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.regenerateText}>{t('fatFinder.regenerate')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={fatFinderReport.findings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FindingCard finding={item} currency={currency} canEdit={canEdit} />}
        ListHeaderComponent={
          <FatFinderHeader
            report={fatFinderReport}
            currency={currency}
            month={fatFinderMonth}
            year={fatFinderYear}
            isCurrentMonth={isCurrentMonth}
            loading={fatFinderLoading}
            intlLocale={intlLocale}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
          />
        }
        ListFooterComponent={
          <FatFinderFooter
            generatedAt={fatFinderReport.generatedAt}
            loading={fatFinderLoading}
            onRegenerate={handleRegenerate}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },

  // Regenerate button (empty state)
  regenerateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  regenerateText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },

  // Loading
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

  // Error
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

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
