import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { BudgetCategoryProgress, Currency } from '@budget/shared-types';
import { useStyles, type Theme } from '@/theme';
import { buildSubcategoryRows } from '@/features/budgets/subcategoryBreakdown';

interface Props {
  category: Pick<BudgetCategoryProgress, 'subcategories' | 'ownSpent'>;
  currencyCode: Currency;
  /** Desktop design language: slightly tighter, tabular figures. */
  compact?: boolean;
}

/** Subcategory rows under a budget line's sum; renders nothing without children. */
export function SubcategoryBreakdownRows({ category, currencyCode, compact }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const rows = buildSubcategoryRows(category);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text
            style={[styles.name, row.name === null && styles.nameMuted]}
            numberOfLines={1}
          >
            {row.name ?? t('budgetDetail.withoutSubcategory')}
          </Text>
          <Text style={styles.amount}>{formatCurrency(row.spent, currencyCode)}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    paddingLeft: theme.spacing[6],
    marginTop: theme.spacing[1.5],
    gap: theme.spacing[1],
  },
  containerCompact: {
    paddingLeft: 0,
    marginTop: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  name: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  nameMuted: {
    color: theme.colors.textTertiary,
  },
  amount: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums' as const],
  },
});
