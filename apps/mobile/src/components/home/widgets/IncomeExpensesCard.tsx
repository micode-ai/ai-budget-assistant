import { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, getStartOfMonth, getEndOfMonth } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { filterConsumption } from '@/utils/consumption';
import { PendingValue } from '../PendingValue';
import type { HomeWidgetContext } from '../HomeWidgetContext';

interface IncomeExpensesCardProps {
  ctx: HomeWidgetContext;
  /**
   * Desktop hero (design round 3's "restore the sub-lines") - shows a
   * transaction-count sub-line under Expenses (`bankImport.transactionCount`,
   * reused verbatim - it is already a proper `_one`/`_few`/`_many`/`_other`
   * plural key in all 9 locales and its wording ("N transactions") fits
   * unchanged). Default `false` - mobile's own call site passes nothing and
   * keeps today's exact two-number layout.
   *
   * Income's own sub-line ("N source(s)", per the approved mockup) is
   * deliberately NOT implemented here: no existing i18n key fits a
   * "source" count, and inventing one across nine locales mid-round is
   * exactly what this task's own instructions say not to do - left absent,
   * reported, for a follow-up decision.
   */
  showCounts?: boolean;
}

export function IncomeExpensesCard({ ctx, showCounts = false }: IncomeExpensesCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { convertedIncomeTotal, convertedExpenseTotal, currency, readiness } = ctx;
  // Absent readiness means ready — the phone passes none, and its SQLite
  // mirror is authoritative offline. See `HomeWidgetContext.readiness`.
  const known = readiness?.transactions !== false;

  // Same filter chain as `computeExpenseTotalsByCurrency` (this month,
  // filterConsumption-applied, not deleted) - "the same data the totals
  // come from", so the count can never disagree with the amount above it.
  const { expenses: rawExpenses } = useExpenseStore();
  const expenseCount = useMemo(() => {
    if (!showCounts) return 0;
    const now = new Date();
    const start = getStartOfMonth(now);
    const end = getEndOfMonth(now);
    return filterConsumption(rawExpenses).filter((e) => {
      if (e.isDeleted) return false;
      const d = new Date(e.date);
      return d >= start && d <= end;
    }).length;
  }, [rawExpenses, showCounts]);

  return (
    <TouchableOpacity key="incomeExpenses" style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(tabs)/expenses' })}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.incomeExpenseRow}>
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalIncome')}</Text>
          {known ? (
            <Text style={styles.incomeAmount}>+{formatCurrency(convertedIncomeTotal, currency)}</Text>
          ) : (
            <PendingValue style={styles.incomeAmount} />
          )}
        </View>
        <View style={styles.incomeExpenseDivider} />
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalExpenses')}</Text>
          {known ? (
            <Text style={styles.expenseTotalAmount}>-{formatCurrency(convertedExpenseTotal, currency)}</Text>
          ) : (
            <PendingValue style={styles.expenseTotalAmount} />
          )}
          {showCounts && (
            <Text style={styles.countSubline}>
              {t('bankImport.transactionCount', { count: expenseCount })}
            </Text>
          )}
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
  incomeExpenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  incomeExpenseCol: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  incomeExpenseDivider: {
    width: 1,
    height: 48,
    backgroundColor: theme.colors.borderLight,
  },
  incomeExpenseLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontWeight: '700' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[4],
    overflow: 'hidden' as const,
    textAlign: 'center' as const,
  },
  incomeAmount: {
    fontSize: 20,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  expenseTotalAmount: {
    fontSize: 20,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  // Desktop hero sub-line (design round 3's "restore the sub-lines" -
  // see the `showCounts` prop). Mobile never passes `showCounts`, so it
  // never renders this style.
  countSubline: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
