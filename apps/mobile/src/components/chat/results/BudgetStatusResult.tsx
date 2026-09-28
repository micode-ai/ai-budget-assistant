import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function BudgetStatusResult({
  data,
  desktop,
}: {
  data: Record<string, unknown>;
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shared = useStyles(createSharedResultStyles);
  const styles = useStyles(createStyles);
  const budgets = (data.budgets as any[]) || [];

  return (
    <View style={shared.card}>
      <View style={shared.header}>
        <Ionicons name="pie-chart-outline" size={18} color={theme.colors.primary} />
        <Text style={shared.headerText}>{t('chat.actionGetBudgetStatus')}</Text>
      </View>
      {budgets.map((b: any, idx: number) => {
        const pct = Math.min(Number(b.percentageUsed || 0), 100);
        const isOver = b.isOverBudget;
        return (
          <View key={idx} style={styles.budgetItem}>
            <View style={styles.budgetHeader}>
              <Text style={shared.listItemText}>{b.name}</Text>
              <Text
                style={[
                  shared.listItemAmount,
                  desktop && shared.listItemAmountDesktop,
                  isOver && { color: theme.colors.danger },
                ]}
              >
                {Number(b.spent || 0).toFixed(0)} / {Number(b.amount).toFixed(0)} {b.currencyCode}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(pct, 100)}%` as any,
                    backgroundColor: isOver ? theme.colors.danger : theme.colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {pct.toFixed(0)}% {t('chat.spent')}
              {b.daysRemaining != null ? ` · ${b.daysRemaining}d ${t('chat.remaining')}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  budgetItem: {
    marginBottom: theme.spacing[3],
  },
  budgetHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[1],
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  progressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
});
