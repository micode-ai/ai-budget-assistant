import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatFinancialMonth } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useFinancialMonth } from '@/hooks/useFinancialMonth';
import type { HomeWidgetContext } from '../HomeWidgetContext';

export function MonthlyBudgetCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { remaining, currency, totalBudget, budgetUsedPercent } = ctx;

  // This card's figures already follow the account's financial month, but
  // nothing said so — on an anchored account "monthly budget" silently meant
  // something other than the calendar month. Label it, and only when the
  // account actually departs from the calendar, so the common case gains no
  // extra chrome.
  const { anchorDay, current } = useFinancialMonth();
  const periodRange =
    anchorDay === null
      ? null
      : formatFinancialMonth(current.start, current.end, getIntlLocale()).range;

  const progressColor = budgetUsedPercent > 90
    ? theme.colors.danger
    : budgetUsedPercent > 70
      ? theme.colors.warning
      : theme.colors.primary;

  return (
    <TouchableOpacity key="monthlyBudget" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/(tabs)/budgets')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{t('dashboard.monthlyBudget')}</Text>
          {periodRange && <Text style={styles.cardSubtitle}>{periodRange}</Text>}
        </View>
      </View>
      <View style={styles.budgetOverview}>
        <View style={styles.budgetAmount}>
          <Text style={[styles.remainingAmount, remaining < 0 && { color: theme.colors.danger }]}>
            {formatCurrency(remaining, currency)}
          </Text>
          <Text style={styles.budgetTotal}>{t('common.of')} {formatCurrency(totalBudget, currency)}</Text>
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(budgetUsedPercent, 100)}%`, backgroundColor: progressColor },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{t('dashboard.used', { percent: budgetUsedPercent.toFixed(0) })}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  cardHeader: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  cardSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  remainingAmount: {
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    fontWeight: '900' as const,
  },
  budgetOverview: {
    gap: theme.spacing[4],
  },
  budgetAmount: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    justifyContent: 'center' as const,
  },
  budgetTotal: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  progressContainer: {
    gap: theme.spacing[2],
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
