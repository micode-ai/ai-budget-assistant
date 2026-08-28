import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, FatFinderReport } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatFatFinderDate } from '@/features/fat-finder/fatFinderDisplay';
import { MonthPicker } from './MonthPicker';

interface FatFinderHeaderProps {
  report: FatFinderReport;
  currency: Currency;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  loading: boolean;
  intlLocale: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function FatFinderHeader({
  report,
  currency,
  month,
  year,
  isCurrentMonth,
  loading,
  intlLocale,
  onPrevMonth,
  onNextMonth,
}: FatFinderHeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.headerSection}>
      <MonthPicker
        month={month}
        year={year}
        isCurrentMonth={isCurrentMonth}
        loading={loading}
        intlLocale={intlLocale}
        onPrev={onPrevMonth}
        onNext={onNextMonth}
      />

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{t('fatFinder.totalSavings')}</Text>
        <Text style={styles.summaryAmount}>
          {formatCurrency(report.totalPotentialSavings, currency)}
        </Text>
        <Text style={styles.summaryPerMonth}>{t('fatFinder.perMonth')}</Text>
        <View style={styles.summaryPeriod}>
          <Ionicons name="calendar-outline" size={14} color={theme.colors.textTertiary} />
          <Text style={styles.summaryPeriodText}>
            {formatFatFinderDate(report.periodStart)} - {formatFatFinderDate(report.periodEnd)}
          </Text>
        </View>
      </View>

      <Text style={styles.findingsCountText}>
        {t('fatFinder.findingsCount', { count: report.findings.length })}
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  headerSection: {
    marginBottom: theme.spacing[4],
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  summaryTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[2],
  },
  summaryAmount: {
    ...theme.textStyles.h1,
    color: theme.colors.primary,
    fontWeight: '700' as const,
  },
  summaryPerMonth: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
    marginBottom: theme.spacing[3],
  },
  summaryPeriod: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  summaryPeriodText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  findingsCountText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[1],
  },
});
