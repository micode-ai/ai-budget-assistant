import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useCategoryStore } from '@/stores/categoryStore';
import { summarise, type LedgerRow } from '@/features/expenses/desktopTable';

interface Props {
  rows: LedgerRow[];
  /** The user's display currency — used only to CHOOSE which currency's figure
   *  to lead with when a currency mixes several. Never used to convert one
   *  currency into another: this app performs no FX inside a ledger total. */
  baseCurrency: string;
}

interface CurrencyPick {
  currency: string;
  amount: number;
  /** How many OTHER currencies also have a nonzero figure, never shown blended
   *  into this one — surfaced as a "+N" affordance instead. */
  more: number;
}

/** Picks which currency's figure leads: the display currency when it actually
 *  has one, else whichever currency has the largest amount (an arbitrary but
 *  stable choice — never a sum across currencies). */
function pickPrimaryCurrency(byCurrency: Map<string, number>, preferred: string): CurrencyPick | null {
  if (byCurrency.size === 0) return null;
  const currency = byCurrency.has(preferred)
    ? preferred
    : [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { currency, amount: byCurrency.get(currency) as number, more: byCurrency.size - 1 };
}

/**
 * Filtered-set overview: spend, income, transaction count, and the largest
 * spending category — four figures, never a blended cross-currency total.
 * `summarise()` already keeps spend/income apart per currency; "largest
 * category" is derived here from the same rows, scoped to whichever currency
 * `pickPrimaryCurrency` chose for spend, for the same reason.
 */
export function SummaryStrip({ rows, baseCurrency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const categories = useCategoryStore((s) => s.categories);

  const { spentByCurrency, earnedByCurrency, count } = useMemo(() => summarise(rows), [rows]);
  const spendPick = useMemo(() => pickPrimaryCurrency(spentByCurrency, baseCurrency), [spentByCurrency, baseCurrency]);
  const earnPick = useMemo(() => pickPrimaryCurrency(earnedByCurrency, baseCurrency), [earnedByCurrency, baseCurrency]);

  const topCategory = useMemo(() => {
    if (!spendPick) return null;
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== 'expense') continue;
      // Same rule as `desktopTable.ts`'s private `isSpend`: a split-receivable
      // row already left the account as the original receipt, so it must not
      // inflate a category total either. Kept as `!isSplitReceivable`, never
      // `=== false`, so a row written before the column existed still counts.
      if (r.expense.isSplitReceivable) continue;
      if (r.expense.currencyCode !== spendPick.currency) continue;
      const key = r.expense.categoryId || '';
      totals.set(key, (totals.get(key) ?? 0) + r.expense.amount);
    }
    if (totals.size === 0) return null;
    const [categoryId, amount] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    const category = categories.find((c) => c.id === categoryId);
    // Carries its own currency (rather than the caller re-reading `spendPick`)
    // so nothing downstream needs a non-null assertion to use it.
    return { name: category?.name ?? t('common.uncategorized'), color: category?.color, amount, currency: spendPick.currency };
  }, [rows, spendPick, categories, t]);

  return (
    <View style={styles.strip}>
      <View style={styles.tile}>
        <Text style={styles.label}>{t('wallet.totalSpent')}</Text>
        {spendPick ? (
          <>
            <Text style={[styles.value, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
              -{formatCurrency(spendPick.amount, spendPick.currency)}
            </Text>
            {spendPick.more > 0 && (
              <Text style={styles.moreCurrencies}>
                {t('expensesDesktop.moreCurrencies', { count: spendPick.more })}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.value, { color: theme.colors.textTertiary }]}>—</Text>
        )}
      </View>

      <View style={styles.tile}>
        <Text style={styles.label}>{t('wallet.totalIncome')}</Text>
        {earnPick ? (
          <>
            <Text style={[styles.value, { color: theme.colors.success, fontVariant: ['tabular-nums'] }]}>
              +{formatCurrency(earnPick.amount, earnPick.currency)}
            </Text>
            {earnPick.more > 0 && (
              <Text style={styles.moreCurrencies}>
                {t('expensesDesktop.moreCurrencies', { count: earnPick.more })}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.value, { color: theme.colors.textTertiary }]}>—</Text>
        )}
      </View>

      <View style={styles.tile}>
        <Text style={styles.label}>{t('expensesDesktop.summaryCount')}</Text>
        <Text style={[styles.value, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
          {count}
        </Text>
      </View>

      <View style={styles.tile}>
        <Text style={styles.label}>{t('analytics.topCategory')}</Text>
        {topCategory ? (
          <>
            <View style={styles.categoryNameRow}>
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: topCategory.color || theme.colors.textDisabled },
                ]}
              />
              <Text style={styles.categoryName} numberOfLines={1}>
                {topCategory.name}
              </Text>
            </View>
            <Text style={[styles.value, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
              -{formatCurrency(topCategory.amount, topCategory.currency)}
            </Text>
          </>
        ) : (
          <Text style={[styles.value, { color: theme.colors.textTertiary }]}>—</Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  strip: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  value: {
    ...theme.textStyles.h3,
  },
  moreCurrencies: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  categoryNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1],
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryName: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
});
