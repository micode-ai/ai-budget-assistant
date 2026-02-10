import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useDrillDown } from '@/features/analytics/useDrillDown';
import { ChartRenderer, DrillDownBreadcrumb } from '@/components/interactive-charts';
import type { ChartDataPoint, DrillDownLevel, Currency } from '@budget/shared-types';

export default function DrillDownScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const params = useLocalSearchParams<{
    startDate: string;
    endDate: string;
    currencyCode?: string;
    level?: string;
  }>();

  const startDate = params.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString();
  const endDate = params.endDate || new Date().toISOString();
  const currencyCode = params.currencyCode;
  const initialLevel = (params.level as DrillDownLevel) || 'year';

  const {
    chartConfig,
    transactions,
    breadcrumb,
    isLoading,
    error,
    canGoBack,
    drillInto,
    goBack,
    goToLevel,
    initialize,
  } = useDrillDown({ startDate, endDate, currencyCode });

  useEffect(() => {
    initialize(initialLevel);
  }, [initialize, initialLevel]);

  const handleDataPointPress = (item: ChartDataPoint, index: number) => {
    if (!chartConfig?.drillDown?.enabled || !chartConfig.drillDown.nextLevel) return;
    drillInto(item, chartConfig.drillDown.nextLevel);
  };

  const handleTransactionPress = (id: string) => {
    router.push(`/expense/${id}`);
  };

  const formatValue = (value: number) => {
    if (currencyCode) {
      return formatCurrency(value, currencyCode as Currency);
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toFixed(0);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Breadcrumb Navigation */}
        {breadcrumb.length > 0 && (
          <DrillDownBreadcrumb
            breadcrumb={breadcrumb}
            onNavigate={goToLevel}
          />
        )}

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={32} color={theme.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => initialize(initialLevel)}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Chart */}
        {!isLoading && !error && chartConfig && (
          <View style={styles.chartContainer}>
            <ChartRenderer
              config={chartConfig}
              onDataPointPress={handleDataPointPress}
              height={220}
              formatValue={formatValue}
            />

            {chartConfig.drillDown?.enabled && (
              <Text style={styles.hintText}>
                {t('drillDown.tapToExplore')}
              </Text>
            )}
          </View>
        )}

        {/* Transactions List */}
        {!isLoading && transactions && transactions.length > 0 && (
          <View style={styles.transactionsContainer}>
            <Text style={styles.sectionTitle}>{t('drillDown.transactions')}</Text>
            {transactions.map((transaction) => (
              <TouchableOpacity
                key={transaction.id}
                style={styles.transactionRow}
                onPress={() => handleTransactionPress(transaction.id)}
              >
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDescription} numberOfLines={1}>
                    {transaction.description}
                  </Text>
                  <Text style={styles.transactionCategory}>
                    {transaction.categoryName}
                  </Text>
                </View>
                <View style={styles.transactionAmountContainer}>
                  <Text style={styles.transactionAmount}>
                    {formatCurrency(transaction.amount, (transaction.currencyCode || currencyCode || 'USD') as Currency)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty transactions */}
        {!isLoading && transactions && transactions.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('drillDown.noTransactions')}</Text>
          </View>
        )}
      </ScrollView>
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
  loadingContainer: {
    paddingVertical: theme.spacing[10],
    alignItems: 'center' as const,
  },
  errorContainer: {
    paddingVertical: theme.spacing[8],
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  errorText: {
    ...theme.textStyles.body,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  retryButton: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginTop: theme.spacing[3],
  },
  hintText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[3],
  },
  transactionsContainer: {
    marginTop: theme.spacing[4],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  transactionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  transactionInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  transactionDescription: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  transactionCategory: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  transactionAmountContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  transactionAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  emptyContainer: {
    paddingVertical: theme.spacing[8],
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
  },
});
