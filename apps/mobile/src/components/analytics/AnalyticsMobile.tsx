import { Text, ScrollView, TouchableOpacity, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  AnalyticsHeader, SummaryCards, SpendingTrendChart, CategoryBreakdown,
  IncomeCategoryBreakdown, MerchantBreakdown, MemberBreakdown, TagBreakdown, ProjectBreakdown,
  DayOfWeekSection, QuickInsights, TopReceiptItems, AiInsightsSection,
  InflationIndexSection, SavingsDetailSheet, CashFlowCard, CommitmentsCard, CashFlowForecastCard, YearOverYearCard, SpendingCalendarCard,
  DiscoveryStrip,
} from '@/components/analytics';
import { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import { useSavingsDetail } from '@/hooks/useSavingsDetail';
import { useChildrenMonthTotals } from '@/features/children/useChildCosts';
import { ChildrenAnalyticsCard } from '@/components/children/ChildrenAnalyticsCard';
import { VehiclesAnalyticsCard } from '@/components/vehicles/VehiclesAnalyticsCard';
import { useVehicles } from '@/features/vehicles/useVehicles';
import { PetsAnalyticsCard } from '@/components/pets/PetsAnalyticsCard';
import { usePets } from '@/features/pets/usePets';

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
    getPeriodRange,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
    availableCurrencies,
    currency,
    dailySpending,
    categorySpending,
    merchantSpending,
    memberSpending,
    incomeByCategory,
    summary,
    itemBreakdown,
    dayOfWeekSpending,
    periodComparison,
    anomalies,
    predictions,
    cashFlowAnalytics,
    cashFlowForecast,
    yearOverYear,
    spendingCalendar,
    tagSpending,
    projectSpending,
    aiInsights,
    aiInsightsProGated,
    openDrillDown,
    drillDownParams,
  } = useAnalyticsScreenData();

  const savingsDetail = useSavingsDetail();
  const childTotals = useChildrenMonthTotals({ activeOnly: true });
  const { vehicles } = useVehicles();
  const { pets } = usePets();
  const handleOpenSavings = (kind: 'discount' | 'deposit') =>
    savingsDetail.open(kind, drillDownParams.startDate, drillDownParams.endDate);

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
          getPeriodRange={getPeriodRange}
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

        <DiscoveryStrip
          selectedYear={selectedYear}
          onOpenStory={() =>
            router.push({ pathname: '/story', params: { month: String(selectedMonth), year: String(selectedYear) } })
          }
        />

        <CashFlowCard
          cashFlow={cashFlowAnalytics.cashFlow}
          months={cashFlowAnalytics.cashFlowMonths}
          currency={currency}
        />
        {cashFlowAnalytics.commitments && cashFlowAnalytics.commitments.fixed + cashFlowAnalytics.commitments.flexible > 0 && (
          <CommitmentsCard commitments={cashFlowAnalytics.commitments} currency={currency} />
        )}
        {cashFlowForecast && <CashFlowForecastCard forecast={cashFlowForecast} />}
        {yearOverYear && <YearOverYearCard data={yearOverYear} currency={currency} />}
        {spendingCalendar && <SpendingCalendarCard data={spendingCalendar} currency={currency} />}


        <AiInsightsSection aiInsights={aiInsights} proGated={aiInsightsProGated} />
        <InflationIndexSection />
        {incomeByCategory.length > 0 && <IncomeCategoryBreakdown incomeByCategory={incomeByCategory} currency={currency} />}
        <SpendingTrendChart dailySpending={dailySpending} selectedRange={selectedRange} onBarPress={openDrillDown} />
        <CategoryBreakdown categorySpending={categorySpending} currency={currency} />
        {merchantSpending.length > 0 && <MerchantBreakdown merchantSpending={merchantSpending} currency={currency} />}
        {memberSpending.length > 0 && <MemberBreakdown memberSpending={memberSpending} currency={currency} />}
        {childTotals.active.length > 0 && (
          <ChildrenAnalyticsCard rows={childTotals.active} currency={childTotals.currency} variant="section" />
        )}
        {vehicles.length > 0 && <VehiclesAnalyticsCard vehicles={vehicles} variant="section" />}
        {pets.length > 0 && <PetsAnalyticsCard pets={pets} variant="section" />}
        {tagSpending.length > 0 && <TagBreakdown tagSpending={tagSpending} currency={currency} />}
        {projectSpending.length > 0 && <ProjectBreakdown projectSpending={projectSpending} currency={currency} />}
        {dayOfWeekSpending.some((d) => d.totalAmount > 0) && <DayOfWeekSection dayOfWeekSpending={dayOfWeekSpending} />}
        <QuickInsights
          summary={summary}
          anomalies={anomalies}
          predictions={predictions}
          selectedRange={selectedRange}
          currency={currency}
          onOpenSavings={handleOpenSavings}
        />
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

      <SavingsDetailSheet
        visible={savingsDetail.kind !== null}
        onClose={savingsDetail.close}
        kind={savingsDetail.kind}
        data={savingsDetail.data}
        loading={savingsDetail.loading}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[8] },
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
