import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Income } from '@budget/shared-types';
import { useTheme } from '@/theme';
import { useTranslation } from 'react-i18next';
import { groupTransactionMark } from '@/features/groups/groupBudgetMirror';

interface Props {
  item: Income;
  onLongPress: (item: Income) => void;
}

export function IncomeListItem({ item, onLongPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  // ABA-661: a settlement I received, linked to its group leg, so it is left out of income totals.
  const linked = groupTransactionMark(item, 'income') === 'linked';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadows.sm as any }]}
      onPress={() => router.push(`/income/${item.id}`)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.success + '18' }]}>
        <Ionicons name={linked ? 'link-outline' : 'trending-up-outline'} size={24} color={theme.colors.success} />
      </View>
      <View style={styles.details}>
        <Text style={[styles.description, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {item.description || 'Income'}
        </Text>
        <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
          {formatDate(item.date, undefined, getIntlLocale())}
        </Text>
        {linked && (
          <Text style={[styles.badge, { color: theme.colors.textTertiary }]}>{t('groupBudget.badgeLinked')}</Text>
        )}
      </View>
      <Text style={[styles.amount, { color: theme.colors.success }]}>
        +{formatCurrency(item.amount, item.currencyCode)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  details: {
    flex: 1,
  },
  description: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  date: {
    fontSize: 13,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
  },
});
