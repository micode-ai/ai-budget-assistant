import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountStore } from '@/stores/accountStore';

interface Props {
  onPress: () => void;
  /** Defaults to `'expense'` so every existing call site keeps compiling unchanged. */
  entityType?: 'expense' | 'income';
}

/**
 * Shown above the expense (or income) list while the current account has
 * uncategorized rows of that type. Counts from the loaded list with the same
 * exclusions the server applies — expenses: planned, split receivables,
 * debts; incomes: debts, debt repayments — so the number matches what the
 * review will offer for everything loaded.
 */
export function UncategorizedBanner({ onPress, entityType = 'expense' }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenseCount = useExpenseStore(
    (s) => s.expenses.filter((e) => !e.categoryId && !e.isPlanned && !e.isSplitReceivable && !e.isDebt).length,
  );
  const incomeCount = useIncomeStore(
    (s) => s.incomes.filter((i) => !i.categoryId && !i.isDebt && !i.isDebtRepayment).length,
  );
  const isIncome = entityType === 'income';
  const count = isIncome ? incomeCount : expenseCount;
  if (!canEdit || count === 0) return null;

  // The count is emphasised, so the label is split around it. Every locale puts
  // the number last, but lastIndexOf keeps a digit earlier in a translation safe.
  // Named, not the bare "Without a category": the desktop screen shows the
  // expense and income banners one above the other.
  const label = t(entityType === 'income' ? 'categorize.bannerTextIncome' : 'categorize.bannerText', { count });
  const countText = String(count);
  const at = label.lastIndexOf(countText);
  const before = at >= 0 ? label.slice(0, at) : label;
  const after = at >= 0 ? label.slice(at + countText.length) : '';

  return (
    <View style={styles.banner}>
      <View style={styles.lead}>
        {/* Direction, not just wording, tells the two desktop banners apart:
            money out is red and points down, money in is green and points up. */}
        <View style={styles.iconCircle}>
          <Ionicons
            name={isIncome ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
            size={18}
            color={isIncome ? theme.colors.success : theme.colors.danger}
          />
        </View>
        <Text style={styles.text}>
          {before}
          {at >= 0 ? <Text style={styles.count}>{countText}</Text> : null}
          {after}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      >
        <Ionicons name="sparkles" size={14} color={theme.colors.textInverse} />
        <Text style={styles.actionText} numberOfLines={1}>
          {t(isIncome ? 'categorize.bannerActionIncome' : 'categorize.bannerActionExpense')}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.textInverse} />
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Wraps instead of truncating: on a phone the button drops to its own line
  // (pushed right by marginLeft: 'auto') so the count stays readable; on a wide
  // screen everything fits in one row.
  banner: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  lead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
  },
  text: { ...theme.textStyles.body, color: theme.colors.textPrimary, flexShrink: 1 },
  count: { fontFamily: theme.fonts.bold },
  action: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    minHeight: 36,
    paddingHorizontal: theme.spacing[3.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  actionPressed: { opacity: 0.85 },
  actionText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textInverse },
});
