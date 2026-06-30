import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { InteractiveLineChart } from '@/components/interactive-charts/InteractiveLineChart';
import type { ChartDataPoint } from '@budget/shared-types';

interface NetProfitWidgetProps {
  refreshKey?: number;
}

export function NetProfitWidget({ refreshKey: _refreshKey = 0 }: NetProfitWidgetProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();
  const { expenses } = useExpenseStore();
  const { incomes } = useIncomeStore();
  const { rates } = useExchangeRateStore();
  const displayCurrency = user?.currencyCode || useExchangeRateStore.getState().baseCurrency || 'USD';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const intlLocale = useMemo(() => getIntlLocale(), [i18n.language]);

  const { data, currentNetProfit } = useMemo(() => {
    const now = new Date();

    const points: ChartDataPoint[] = Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i;
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      const label = start.toLocaleDateString(intlLocale, { month: 'short' });

      const monthIncome = incomes
        .filter((inc) => {
          if (inc.isDeleted) return false;
          const dt = new Date(inc.date);
          return dt >= start && dt <= end;
        })
        .reduce((sum, inc) => sum + convertAmount(inc.amount, inc.currencyCode, displayCurrency, rates), 0);

      const monthExpense = expenses
        .filter((exp) => {
          if (exp.isDeleted) return false;
          const dt = new Date(exp.date);
          return dt >= start && dt <= end;
        })
        .reduce((sum, exp) => sum + convertAmount(exp.amount, exp.currencyCode, displayCurrency, rates), 0);

      return { label, value: monthIncome - monthExpense };
    });

    return {
      data: points,
      currentNetProfit: points[points.length - 1]?.value ?? null,
    };
  }, [expenses, incomes, rates, displayCurrency, intlLocale]);

  const isPositive = (currentNetProfit ?? 0) >= 0;
  const lineColor = isPositive ? theme.colors.success : theme.colors.danger;

  const header = (
    <View style={styles.headerRow}>
      <Ionicons name="trending-up-outline" size={20} color={theme.colors.primary} />
      <Text style={styles.cardTitle}>{t('dashboard.netProfit')}</Text>
    </View>
  );

  return (
    <View style={styles.card}>
      {header}
      <Text style={styles.subtitle}>{t('dashboard.netProfitSubtitle')}</Text>
      {currentNetProfit !== null && (
        <Text style={[styles.mainAmount, { color: lineColor }]}>
          {isPositive ? '+' : ''}{formatCurrency(currentNetProfit, displayCurrency)}
        </Text>
      )}
      <InteractiveLineChart
        data={data}
        height={200}
        lineColor={lineColor}
        areaChart
        formatValue={(v) => formatCurrency(v, displayCurrency)}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden' as const,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  mainAmount: {
    ...theme.textStyles.h2,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[3],
  },
});
