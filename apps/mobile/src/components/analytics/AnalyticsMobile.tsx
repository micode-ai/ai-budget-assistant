import { View, Text, ScrollView, TouchableOpacity, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  AnalyticsHeader, SummaryCards, SpendingTrendChart, CategoryBreakdown,
  IncomeCategoryBreakdown, MerchantBreakdown, TagBreakdown, ProjectBreakdown,
  DayOfWeekSection, QuickInsights, TopReceiptItems, AiInsightsSection,
  InflationIndexSection,
} from '@/components/analytics';
import { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function AnalyticsMobile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    selectedRange,
    setSelectedRange,
    selectedCurrency,
    setSelectedCurrency,
    selectedMonth,
    selectedYear,
    isCurrentPeriod,
    getPeriodLabel,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
    availableCurrencies,
    currency,
    dailySpending,
    categorySpending,
    merchantSpending,
    incomeByCategory,
    summary,
    itemBreakdown,
    dayOfWeekSpending,
    periodComparison,
    anomalies,
    predictions,
    tagSpending,
    projectSpending,
    aiInsights,
    aiInsightsProGated,
    openDrillDown,
  } = useAnalyticsScreenData();

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

        <TouchableOpacity
          style={styles.storyBanner}
          onPress={() => router.push({ pathname: '/wrapped', params: { year: String(selectedYear) } })}
        >
          <Ionicons name="gift-outline" size={24} color={theme.colors.primary} />
          <View style={styles.storyBannerContent}>
            <Text style={styles.storyBannerTitle}>{t('wrapped.title')}</Text>
            <Text style={styles.storyBannerSubtext}>{t('wrapped.introSub')}</Text>
          </View>
          <Ionicons name="sparkles" size={16} color={theme.colors.warning} />
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        <AiInsightsSection aiInsights={aiInsights} proGated={aiInsightsProGated} />
        <InflationIndexSection />
        {incomeByCategory.length > 0 && <IncomeCategoryBreakdown incomeByCategory={incomeByCategory} currency={currency} />}
        <SpendingTrendChart dailySpending={dailySpending} selectedRange={selectedRange} onBarPress={openDrillDown} />
        <CategoryBreakdown categorySpending={categorySpending} currency={currency} />
        {merchantSpending.length > 0 && <MerchantBreakdown merchantSpending={merchantSpending} currency={currency} />}
        {tagSpending.length > 0 && <TagBreakdown tagSpending={tagSpending} currency={currency} />}
        {projectSpending.length > 0 && <ProjectBreakdown projectSpending={projectSpending} currency={currency} />}
        {dayOfWeekSpending.some((d) => d.totalAmount > 0) && <DayOfWeekSection dayOfWeekSpending={dayOfWeekSpending} />}
        <QuickInsights summary={summary} anomalies={anomalies} predictions={predictions} selectedRange={selectedRange} currency={currency} />
        {itemBreakdown.length > 0 && <TopReceiptItems itemBreakdown={itemBreakdown} currency={currency} />}

        <TouchableOpacity
          style={styles.exportButton}
          onPress={() =>
            router.push({
              pathname: '/reports',
              params: {
                range: selectedRange,
                month: String(selectedMonth),
                year: String(selectedYear),
              },
            })
          }
        >
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
