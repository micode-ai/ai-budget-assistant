import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { HomeWidgetContext } from '../HomeWidgetContext';

export function IncomeExpensesCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { convertedIncomeTotal, convertedExpenseTotal, currency } = ctx;

  return (
    <TouchableOpacity key="incomeExpenses" style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/(tabs)/expenses' })}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.incomeExpenseRow}>
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalIncome')}</Text>
          <Text style={styles.incomeAmount}>+{formatCurrency(convertedIncomeTotal, currency)}</Text>
        </View>
        <View style={styles.incomeExpenseDivider} />
        <View style={styles.incomeExpenseCol}>
          <Text style={styles.incomeExpenseLabel}>{t('dashboard.totalExpenses')}</Text>
          <Text style={styles.expenseTotalAmount}>-{formatCurrency(convertedExpenseTotal, currency)}</Text>
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
});
