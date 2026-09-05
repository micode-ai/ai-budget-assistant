import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
import { filterConsumption } from '@/utils/consumption';
import type { ChartDataPoint, SafeToSpendResponse } from '@budget/shared-types';

/** 3M/6M/12M window for the trend chart — desktop's range control (see
 *  `showRangeChips` below); mobile never renders the control, so `range`
 *  stays pinned at its default and the chart keeps showing exactly 6 months. */
export type NetProfitRange = '3m' | '6m' | '12m';

const RANGE_MONTHS: Record<NetProfitRange, number> = { '3m': 3, '6m': 6, '12m': 12 };
const RANGES: NetProfitRange[] = ['3m', '6m', '12m'];

function monthsForRange(range: NetProfitRange): number {
  return RANGE_MONTHS[range];
}

interface NetProfitWidgetSafeToSpend {
  data: SafeToSpendResponse | null;
  hasEnoughData: boolean;
  onPress: () => void;
}

interface NetProfitWidgetProps {
  refreshKey?: number;
  /**
   * Desktop web (`docs/design/2026-09-05-dashboard-web.md`'s "NetProfitWidget's
   * new props, precisely") — an optional eyebrow row above the existing
   * subtitle/headline showing today's Safe-to-Spend figure, restoring on
   * desktop what `HomeHeroHeader` (hidden there) is the only place that shows
   * on mobile. Renders only when `hasEnoughData` and `data` are both present —
   * same gate `HomeHeroHeader` already uses (`hasSafeToSpend && safeToSpendData`).
   * Undefined by default — mobile's own call site passes nothing, so this
   * never renders there.
   */
  safeToSpend?: NetProfitWidgetSafeToSpend;
  /**
   * Renders a 3M/6M/12M segmented control under the chart when `true`
   * (default `false`, so mobile's own call site — which passes nothing —
   * is unaffected). The component owns the selected range as its own local
   * state; no lifting required by the caller.
   */
  showRangeChips?: boolean;
}

export function NetProfitWidget({
  refreshKey: _refreshKey = 0,
  safeToSpend,
  showRangeChips = false,
}: NetProfitWidgetProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();
  const { expenses: rawExpenses } = useExpenseStore();
  // Split-receivable debt rows are bookkeeping for a receivable, not consumption —
  // the original receipt already carries the outflow. Net profit is a cash-flow
  // surface, so it excludes them too (see docs/superpowers/specs/2026-07-24-receipt-split-guest-link-design.md).
  const expenses = useMemo(() => filterConsumption(rawExpenses), [rawExpenses]);
  const { incomes } = useIncomeStore();
  const { rates } = useExchangeRateStore();
  const displayCurrency = user?.currencyCode || useExchangeRateStore.getState().baseCurrency || 'USD';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const intlLocale = useMemo(() => getIntlLocale(), [i18n.language]);

  // Defaults to '6m' regardless of `showRangeChips` — when the control isn't
  // rendered there is nothing to change it with, so this reproduces today's
  // hardcoded 6-month window exactly.
  const [range, setRange] = useState<NetProfitRange>('6m');
  const monthCount = monthsForRange(range);

  const { data, currentNetProfit } = useMemo(() => {
    const now = new Date();

    const points: ChartDataPoint[] = Array.from({ length: monthCount }, (_, i) => {
      const offset = monthCount - 1 - i;
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
  }, [expenses, incomes, rates, displayCurrency, intlLocale, monthCount]);

  const isPositive = (currentNetProfit ?? 0) >= 0;
  const lineColor = isPositive ? theme.colors.success : theme.colors.danger;

  const header = (
    <View style={styles.headerRow}>
      <Ionicons name="trending-up-outline" size={20} color={theme.colors.primary} />
      <Text style={styles.cardTitle}>{t('dashboard.netProfit')}</Text>
    </View>
  );

  const showSafeToSpendRow = !!safeToSpend && safeToSpend.hasEnoughData && !!safeToSpend.data;

  return (
    <View style={styles.card}>
      {header}
      {showSafeToSpendRow && (
        <TouchableOpacity style={styles.stsEyebrowRow} onPress={safeToSpend!.onPress} activeOpacity={0.7}>
          <Text style={styles.stsEyebrowLabel}>{t('safeToSpend.title')}</Text>
          <View style={styles.stsEyebrowValueRow}>
            <Text style={styles.stsEyebrowAmount}>
              {formatCurrency(safeToSpend!.data!.safeToSpendToday, safeToSpend!.data!.baseCurrency)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.textTertiary} />
          </View>
        </TouchableOpacity>
      )}
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
      {showRangeChips && (
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.rangeChip, range === r && styles.rangeChipActive]}
              onPress={() => setRange(r)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeChipText, range === r && styles.rangeChipTextActive]}>
                {t('wallet.monthsWindow', { count: monthsForRange(r) })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    marginBottom: theme.spacing[5],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
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
  // Safe-to-Spend eyebrow row (desktop-only content — see `safeToSpend` prop).
  stsEyebrowRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  stsEyebrowLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  stsEyebrowValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  stsEyebrowAmount: {
    ...theme.textStyles.bodySmMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
  },
  // 3M/6M/12M range control (desktop-only content — see `showRangeChips` prop),
  // mirroring `WalletBalanceCard`'s own period-selector chip styling.
  rangeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  rangeChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.primary,
  },
  rangeChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  rangeChipTextActive: {
    color: '#fff',
  },
});
