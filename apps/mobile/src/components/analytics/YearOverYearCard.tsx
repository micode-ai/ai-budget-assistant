import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { YearOverYearAnalytics } from '@/features/analytics/useYearOverYear';

interface Props {
  data: YearOverYearAnalytics;
  currency: string;
}

/**
 * This month (or year) against the same period a year earlier, per top-level
 * category (ABA-797). Spending more reads red, less reads green — the same
 * reading as the "vs average" chips. A category with nothing last year says
 * "new" instead of a percentage. Shared by phone and desktop.
 */
export function YearOverYearCard({ data, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const changeLabel = (change: number | null) => {
    if (change === null) return t('analytics.yoyNew');
    const rounded = Math.round(change);
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  };
  const changeColor = (change: number | null) =>
    change === null || Math.round(change) === 0
      ? theme.colors.textSecondary
      : change > 0
        ? theme.colors.danger
        : theme.colors.success;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.yoyTitle')}</Text>
      <View style={styles.card}>
        <Text style={styles.subtitle}>{data.partial ? t('analytics.yoySubtitlePartial') : t('analytics.yoySubtitle')}</Text>

        <View style={styles.totalRow}>
          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>{t('analytics.yoyThisPeriod')}</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.totals.current, currency)}</Text>
          </View>
          <View style={styles.totalBlock}>
            <Text style={styles.totalLabel}>{t('analytics.yoyLastYear')}</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.totals.lastYear, currency)}</Text>
          </View>
          <Text style={[styles.totalChange, { color: changeColor(data.totals.change) }]}>
            {changeLabel(data.totals.change)}
          </Text>
        </View>

        {data.rows.map((row) => (
          <View key={row.categoryId ?? 'uncategorized'} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: row.color }]} />
            <View style={styles.nameBlock}>
              <Text style={styles.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.lastYear}>
                {t('analytics.yoyWas', { amount: formatCurrency(row.lastYear, currency) })}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(row.current, currency)}</Text>
            <Text style={[styles.change, { color: changeColor(row.change) }]}>{changeLabel(row.change)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[5] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  subtitle: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  totalRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  totalBlock: { flex: 1, minWidth: 0 },
  totalLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  totalValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  totalChange: { ...theme.textStyles.bodyMedium, fontWeight: '700' as const, minWidth: 56, textAlign: 'right' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nameBlock: { flex: 1, minWidth: 0 },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  lastYear: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  amount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  change: { ...theme.textStyles.bodySm, fontWeight: '600' as const, minWidth: 56, textAlign: 'right' as const },
});
