import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { InteractiveLineChart } from '@/components/interactive-charts/InteractiveLineChart';
import type { ChartDataPoint } from '@budget/shared-types';

interface NetProfitWidgetProps {
  refreshKey?: number;
}

export function NetProfitWidget({ refreshKey = 0 }: NetProfitWidgetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const currency = user?.currencyCode || 'USD';

  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [currentNetProfit, setCurrentNetProfit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthRanges = useMemo(() => {
    const now = new Date();
    const intlLocale = getIntlLocale();
    return Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i; // 5,4,3,2,1,0 — oldest to newest
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = start.toLocaleDateString(intlLocale, { month: 'short' });
      return { start, end, label };
    });
  }, []);

  useEffect(() => {
    if (!currentAccountId) return;
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          monthRanges.map(({ start, end }) =>
            api.getAnalyticsSummary(
              start.toISOString().split('T')[0],
              end.toISOString().split('T')[0],
            ),
          ),
        );
        if (cancelled) return;

        const points: ChartDataPoint[] = results.map((r, i) => ({
          label: monthRanges[i].label,
          value: (r as any).netSavings ?? 0,
        }));

        setData(points);
        setCurrentNetProfit(points[points.length - 1]?.value ?? null);
      } catch {
        if (!cancelled) setError(t('common.error'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [currentAccountId, refreshKey, monthRanges, t]);

  const isPositive = (currentNetProfit ?? 0) >= 0;
  const lineColor = isPositive ? theme.colors.success : theme.colors.danger;

  const header = (
    <View style={styles.headerRow}>
      <Ionicons name="trending-up-outline" size={20} color={theme.colors.primary} />
      <Text style={styles.cardTitle}>{t('dashboard.netProfit')}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.card}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        {header}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {header}
      <Text style={styles.subtitle}>{t('dashboard.netProfitSubtitle')}</Text>
      {currentNetProfit !== null && (
        <Text style={[styles.mainAmount, { color: lineColor }]}>
          {isPositive ? '+' : ''}{formatCurrency(currentNetProfit, currency)}
        </Text>
      )}
      <InteractiveLineChart
        data={data}
        height={160}
        lineColor={lineColor}
        areaChart
        formatValue={(v) => formatCurrency(v, currency)}
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
  loadingContainer: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
    gap: theme.spacing[2],
  },
  loadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    flex: 1,
  },
});
