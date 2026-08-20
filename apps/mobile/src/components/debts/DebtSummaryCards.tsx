import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';

interface DebtSummaryCardsProps {
  totalLent: number;
  totalBorrowed: number;
  currencyCode: string;
}

export function DebtSummaryCards({ totalLent, totalBorrowed, currencyCode }: DebtSummaryCardsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryCard, styles.summaryCardLent]}>
        <Ionicons name="arrow-down-circle-outline" size={24} color={theme.colors.success} />
        <Text style={styles.summaryLabel}>{t('debt.peopleOweYou')}</Text>
        <Text style={[styles.summaryAmount, { color: theme.colors.success }]}>
          {formatCurrency(totalLent, currencyCode)}
        </Text>
      </View>
      <View style={[styles.summaryCard, styles.summaryCardBorrowed]}>
        <Ionicons name="arrow-up-circle-outline" size={24} color={theme.colors.danger} />
        <Text style={styles.summaryLabel}>{t('debt.youOwe')}</Text>
        <Text style={[styles.summaryAmount, { color: theme.colors.danger }]}>
          {formatCurrency(totalBorrowed, currencyCode)}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  summaryRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  summaryCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    alignItems: 'flex-start' as const,
    ...theme.shadows.sm,
  },
  summaryCardLent: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  summaryCardBorrowed: {
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.danger,
  },
  summaryLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  summaryAmount: {
    ...theme.textStyles.h3,
    marginTop: theme.spacing[1],
  },
});
