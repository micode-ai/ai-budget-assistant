import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function ExpensesResult({ data, desktop }: { data: Record<string, unknown>; desktop: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  // When a keyword filter was applied, `matchedExpenses` contains only the
  // semantically matched items. Fall back to `recentExpenses` for general queries.
  const expenses = (data.matchedExpenses as any[]) || (data.recentExpenses as any[]) || (data.expenses as any[]) || [];
  const count = Number(data.count ?? expenses.length);
  const totalsByCurrency = (data.totalsByCurrency as Record<string, number>) || {};
  const totalEntries = Object.entries(totalsByCurrency);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionGetExpenses')} ({count})
        </Text>
      </View>
      {expenses.slice(0, 5).map((exp: any, idx: number) => {
        const expenseId = exp.expenseId ?? exp.id;
        return (
          <TouchableOpacity
            key={idx}
            style={styles.listItem}
            onPress={() => router.push(`/expense/${expenseId}` as any)}
          >
            <Text style={styles.listItemText} numberOfLines={1}>
              {exp.description || exp.category || '—'}
            </Text>
            <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
              {Number(exp.amount).toFixed(2)} {exp.currencyCode}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        );
      })}
      {expenses.length > 5 && (
        <Text style={styles.moreText}>{t('chat.andMore', { count: expenses.length - 5 })}</Text>
      )}
      {totalEntries.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('common.total') || 'Total'}:</Text>
          <Text style={[styles.totalValue, desktop && styles.totalValueDesktop]}>
            {totalEntries
              .map(([cur, amt]) => `${Number(amt).toFixed(2)} ${cur}`)
              .join(' · ')}
          </Text>
        </View>
      )}
    </View>
  );
}
