import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function CreateSuccessResult({ actionType, data }: { actionType: string; data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);

  const labels: Record<string, string> = {
    create_expense: t('chat.actionCreateExpense'),
    create_income: t('chat.actionCreateIncome'),
    create_budget: t('chat.actionCreateBudget'),
    create_category: t('chat.actionCreateCategory'),
  };

  return (
    <View style={[styles.card, styles.successCard]}>
      <View style={styles.header}>
        <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
        <Text style={[styles.headerText, { color: theme.colors.success }]}>
          {t('chat.resultSuccess')}
        </Text>
      </View>
      <Text style={styles.successDetail}>
        {labels[actionType] || actionType}
        {data.amount ? `: ${Number(data.amount).toFixed(2)} ${data.currencyCode || ''}` : ''}
        {actionType === 'create_category' && data.name ? `: ${data.name} (${data.type})` : ''}
      </Text>
    </View>
  );
}
