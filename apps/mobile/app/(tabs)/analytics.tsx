import { View, Text, ScrollView, TouchableOpacity, Platform, UIManager } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useWalletStore } from '@/stores/walletStore';
import { useExchangeRateStore } from '@/stores/exchangeRateStore';
import { useInsightsStore } from '@/stores/insightsStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAnalytics, type TimeRange } from '@/features/analytics/useAnalytics';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { usePeriodNavigation } from '@/hooks/usePeriodNavigation';
import {
  AnalyticsHeader, SummaryCards, SpendingTrendChart, CategoryBreakdown,
  MerchantBreakdown, TagBreakdown, ProjectBreakdown, DayOfWeekSection, QuickInsights,
  TopReceiptItems, AiInsightsSection,
} from '@/components/analytics';
import type { Currency } from '@budget/shared-types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('month');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(undefined);
  const intlLocale = getIntlLocale();

  const { selectedMonth, selectedYear, isCurrentPeriod, getPeriodLabel, goToPrevPeriod, goToNextPeriod, resetToCurrentPeriod } =
    usePeriodNavigation(selectedRange, intlLocale);

  const analytics = useAnalytics(
    selectedRange, selectedCurrency,
    selectedRange !== 'week' ? selectedMonth : undefined,
    selectedYear,
  );
  const { dailySpending, categorySpending, merchantSpending, summary, itemBreakdown, dayOfWeekSpending, periodComparison, anomalies, predictions, dateRange, tagSpending, projectSpending } = analytics;

  const { aiInsights, loadAIInsights } = useInsightsStore();
  const { loadRates } = useExchangeRateStore();
  const { loadTags } = useTagStore();
  const { loadProjects } = useProjectStore();
  const { walletSummary } = useWalletStore();
  const { user } = useAuthStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const availableCurrencies = walletSummary.map((s) => s.currencyCode);
  const currency = selectedCurrency || user?.currencyCode || 'USD';

  useEffect(() => {
    loadAIInsights(i18n.language);
    loadRates();
    loadTags();
    loadProjects();
  }, [loadAIInsights, loadRates, loadTags, loadProjects, i18n.language]);

  useEffect(() => {
    if (!currentAccountId) return;
    hydrateTransactions();
  }, [currentAccountId]);

  const openDrillDown = useCallback(() => {
    router.push({
      pathname: '/analytics/drill-down',
      params: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        currencyCode: currency,
        level: selectedRange === 'year' ? 'year' : 'month',
      },
    });
  }, [dateRange.startDate, dateRange.endDate, currency, selectedRange]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <AnalyticsHeader
          selectedRange={selectedRange}
          onRangeChange={(range) => { setSelectedRange(range); if (range === 'week') resetToCurrentPeriod(); }}
          selectedCurrency={selectedCurrency}
          onCurrencyChange={setSelectedCurrency}
          availableCurrencies={availableCurrencies}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          isCurrentPeriod={isCurrentPeriod}
          getPeriodLabel={getPeriodLabel}
          goToPrevPeriod={goToPrevPeriod}
          goToNextPeriod={goToNextPeriod}
        />

        <SummaryCards
          summary={summary}
          periodComparison={periodComparison}
          selectedRange={selectedRange}
          currency={currency}
          onPress={openDrillDown}
        />

        <TouchableOpacity
          style={styles.storyBanner}
          onPress={() => router.push({ pathname: '/story', params: { month: String(selectedMonth), year: String(selectedYear) } })}
        >
          <Ionicons name="book-outline" size={24} color={theme.colors.primary} />
          <View style={styles.storyBannerContent}>
            <Text style={styles.storyBannerTitle}>{t('story.viewStory')}</Text>
            <Text style={styles.storyBannerSubtext}>{t('story.title')}</Text>
          </View>
          <Ionicons name="sparkles" size={16} color={theme.colors.warning} />
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.storyBanner} onPress={() => router.push('/scenario-simulator')}>
          <Ionicons name="flask-outline" size={24} color={theme.colors.primary} />
          <View style={styles.storyBannerContent}>
            <Text style={styles.storyBannerTitle}>{t('scenarioSimulator.title')}</Text>
            <Text style={styles.storyBannerSubtext}>{t('scenarioSimulator.subtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        <AiInsightsSection aiInsights={aiInsights} />
        <SpendingTrendChart dailySpending={dailySpending} selectedRange={selectedRange} onBarPress={openDrillDown} />
        <CategoryBreakdown categorySpending={categorySpending} currency={currency} />
        {merchantSpending.length > 0 && <MerchantBreakdown merchantSpending={merchantSpending} currency={currency} />}
        {tagSpending.length > 0 && <TagBreakdown tagSpending={tagSpending} currency={currency} />}
        {projectSpending.length > 0 && <ProjectBreakdown projectSpending={projectSpending} currency={currency} />}
        {dayOfWeekSpending.some((d) => d.totalAmount > 0) && <DayOfWeekSection dayOfWeekSpending={dayOfWeekSpending} />}
        <QuickInsights summary={summary} anomalies={anomalies} predictions={predictions} selectedRange={selectedRange} currency={currency} />
        {itemBreakdown.length > 0 && <TopReceiptItems itemBreakdown={itemBreakdown} currency={currency} />}

        <TouchableOpacity style={styles.exportButton} onPress={() => router.push('/reports')}>
          <Ionicons name="download-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.exportButtonText}>{t('analytics.exportReport')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[8] },
  storyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    gap: theme.spacing[3],
  },
  storyBannerContent: { flex: 1 },
  storyBannerTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  storyBannerSubtext: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: theme.spacing[0.5] },
  exportButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  exportButtonText: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.primary },
});
