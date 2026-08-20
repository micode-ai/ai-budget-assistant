import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { DebtSummary } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getStatusColor, getStatusBackgroundColor, formatDueDate } from '@/features/debts/debtDisplay';

interface DebtListItemProps {
  item: DebtSummary;
}

export function DebtListItem({ item }: DebtListItemProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const progress = item.originalAmount > 0
    ? Math.min(item.totalRepaid / item.originalAmount, 1)
    : 0;
  const progressPercent = Math.round(progress * 100);

  const handlePress = () => {
    if (item.type === 'lent') {
      router.push(`/expense/${item.id}`);
    } else {
      router.push(`/income/${item.id}`);
    }
  };

  return (
    <TouchableOpacity style={styles.debtCard} onPress={handlePress}>
      <View style={styles.debtHeader}>
        <View style={styles.debtInfo}>
          <Text style={styles.contactName} numberOfLines={1}>
            {item.contactName}
          </Text>
          {item.description ? (
            <Text style={styles.debtDescription} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusBackgroundColor(theme, item.status) },
          ]}
        >
          <Text style={[styles.statusText, { color: getStatusColor(theme, item.status) }]}>
            {t(`debt.status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`)}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View style={styles.amountColumn}>
          <Text style={styles.amountLabel}>{t('debt.originalAmount')}</Text>
          <Text style={styles.originalAmount}>
            {formatCurrency(item.originalAmount, item.currencyCode)}
          </Text>
        </View>
        <View style={styles.amountColumn}>
          <Text style={styles.amountLabel}>{t('debt.remaining')}</Text>
          <Text
            style={[
              styles.remainingAmount,
              {
                color:
                  item.status === 'paid'
                    ? theme.colors.success
                    : item.status === 'overdue'
                      ? theme.colors.danger
                      : theme.colors.textPrimary,
              },
            ]}
          >
            {formatCurrency(item.remainingAmount, item.currencyCode)}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPercent}%`,
                backgroundColor:
                  item.status === 'paid'
                    ? theme.colors.success
                    : item.status === 'overdue'
                      ? theme.colors.danger
                      : theme.colors.primary,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progressPercent}%</Text>
      </View>

      {item.dueDate ? (
        <View style={styles.dueDateRow}>
          <Ionicons name="calendar-outline" size={14} color={theme.colors.textTertiary} />
          <Text
            style={[
              styles.dueDateText,
              item.status === 'overdue' && { color: theme.colors.danger },
            ]}
          >
            {formatDueDate(item.dueDate)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  debtCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  debtHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: theme.spacing[3],
  },
  debtInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  contactName: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  debtDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  statusBadge: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  statusText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  amountRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  amountColumn: {
    flex: 1,
  },
  amountLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[0.5],
  },
  originalAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  remainingAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  progressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
  },
  dueDateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
  },
  dueDateText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
});
