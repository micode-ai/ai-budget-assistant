import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { HomeWidgetContext } from '../HomeWidgetContext';

export function DebtsCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { lentDebts, borrowedDebts, convertedLentTotal, convertedBorrowedTotal, currency } = ctx;

  return (
    <TouchableOpacity key="debts" style={styles.card} activeOpacity={0.7} onPress={() => router.push('/debts')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('debt.debtsAndLoans')}</Text>
      </View>
      {lentDebts.length > 0 || borrowedDebts.length > 0 ? (
        <View style={styles.debtRow}>
          <View style={styles.debtCol}>
            <Ionicons name="arrow-up-circle-outline" size={20} color={theme.colors.success} />
            <Text style={styles.debtLabel}>{t('debt.peopleOweYou')}</Text>
            <Text style={[styles.debtAmount, { color: theme.colors.success }]}>
              {formatCurrency(convertedLentTotal, currency)}
            </Text>
          </View>
          <View style={styles.debtDivider} />
          <View style={styles.debtCol}>
            <Ionicons name="arrow-down-circle-outline" size={20} color={theme.colors.danger} />
            <Text style={styles.debtLabel}>{t('debt.youOwe')}</Text>
            <Text style={[styles.debtAmount, { color: theme.colors.danger }]}>
              {formatCurrency(convertedBorrowedTotal, currency)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.debtEmptyState}>
          <Ionicons name="people-outline" size={32} color={theme.colors.textDisabled} />
          <Text style={styles.debtEmptyText}>{t('debt.noDebts')}</Text>
          <View style={styles.debtAddButton}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.debtAddButtonText}>{t('debt.addDebt')}</Text>
          </View>
        </View>
      )}
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
  debtRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  debtCol: {
    flex: 1,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  debtDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: theme.spacing[2],
  },
  debtLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  debtAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  debtEmptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[4],
    gap: theme.spacing[2],
  },
  debtEmptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  debtAddButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  debtAddButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
