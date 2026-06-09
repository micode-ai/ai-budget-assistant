import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { InsightCarousel } from '@/components/insights/InsightCarousel';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { Ionicons } from '@expo/vector-icons';
import { usePortfolioAnalytics } from '@/hooks/usePortfolioAnalytics';
import { PerformanceCard } from '@/components/investment/PerformanceCard';
import { AllocationCard } from '@/components/investment/AllocationCard';
import { GainersCard } from '@/components/investment/GainersCard';
import { BenchmarkCard } from '@/components/investment/BenchmarkCard';
import { FormulaModal, type FormulaType } from '@/components/investment/FormulaModal';
import type { PortfolioAnalyticsResponse } from '@budget/shared-types';

type Period = '1W' | '1M' | '3M' | '1Y' | 'All';

const PERIODS: Period[] = ['1W', '1M', '3M', '1Y', 'All'];
const PERIOD_MAP: Record<Period, string> = {
  '1W': 'week', '1M': 'month', '3M': 'quarter', '1Y': 'year', 'All': 'all',
};

export default function PortfolioAnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const loadSubscription = useSubscriptionStore((s) => s.loadSubscription);
  const { aiInsights, insightsLoading, loadInvestmentInsights, dismissInsight } = useInvestmentStore();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1M');
  const [selectedBenchmark, setSelectedBenchmark] = useState('SPY');
  const [analytics, setAnalytics] = useState<PortfolioAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [formulaModal, setFormulaModal] = useState<FormulaType | null>(null);

  useEffect(() => { loadSubscription(); }, [loadSubscription]);
  useEffect(() => { loadInvestmentInsights(i18n.language); }, [loadInvestmentInsights, i18n.language]);

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  useEffect(() => {
    if (selectedBenchmark) fetchBenchmark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBenchmark]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await api.getPortfolioAnalytics(PERIOD_MAP[selectedPeriod]);
      setAnalytics(data);
    } catch {
      // ignore — UI stays with previous data or null
    } finally {
      setLoading(false);
    }
  };

  const fetchBenchmark = async () => {
    setBenchmarkLoading(true);
    try {
      const data = await api.getPortfolioAnalytics(PERIOD_MAP[selectedPeriod], selectedBenchmark);
      setAnalytics((prev) => prev ? {
        ...prev,
        performance: {
          ...prev.performance,
          benchmarkValues: data.performance?.benchmarkValues,
          benchmarkName: data.performance?.benchmarkName,
        },
      } : data);
    } catch {
      // ignore — benchmark data stays stale
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const computed = usePortfolioAnalytics(analytics);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('investments.analytics')}</Text>

        <View style={styles.insightsSection}>
          <View style={styles.insightsHeader}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
            <Text style={styles.insightsTitle}>{t('investments.insights.title')}</Text>
            <View style={{ flex: 1 }} />
            <AiUsageBadge />
          </View>
          <InsightCarousel insights={aiInsights} isLoading={insightsLoading} onDismiss={dismissInsight} />
        </View>

        <View style={styles.periodSelector}>
          {PERIODS.map((period) => (
            <TouchableOpacity
              key={period}
              style={[styles.periodButton, selectedPeriod === period && styles.periodButtonActive]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text style={[styles.periodButtonText, selectedPeriod === period && styles.periodButtonTextActive]}>
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            <PerformanceCard
              performanceHistory={computed.performanceHistory}
              latestValue={computed.latestValue}
              periodReturn={computed.periodReturn}
              isPeriodPositive={computed.isPeriodPositive}
              onInfoPress={() => setFormulaModal('performance')}
            />
            <AllocationCard
              allocation={computed.allocation}
              onInfoPress={() => setFormulaModal('allocation')}
            />
            <GainersCard
              topGainers={computed.topGainers}
              topLosers={computed.topLosers}
              onInfoPress={() => setFormulaModal('gainers')}
            />
            <BenchmarkCard
              benchmarkComparison={computed.benchmarkComparison}
              benchmarkLoading={benchmarkLoading}
              selectedBenchmark={selectedBenchmark}
              onBenchmarkChange={setSelectedBenchmark}
              onInfoPress={() => setFormulaModal('benchmark')}
            />
          </>
        )}
      </ScrollView>

      {formulaModal && (
        <FormulaModal
          type={formulaModal}
          onClose={() => setFormulaModal(null)}
          earliestValue={computed.earliestValue}
          latestValue={computed.latestValue}
          periodReturn={computed.periodReturn}
          benchmarkComparison={computed.benchmarkComparison}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  title: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
  },
  insightsSection: {
    marginBottom: theme.spacing[5],
  },
  insightsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  insightsTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[5],
  },
  periodButton: {
    flex: 1,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  periodButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  periodButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  periodButtonTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  loadingContainer: {
    padding: theme.spacing[12],
    alignItems: 'center' as const,
  },
});
