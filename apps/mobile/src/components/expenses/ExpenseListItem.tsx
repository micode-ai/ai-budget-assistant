import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Expense } from '@budget/shared-types';
import { useTheme } from '@/theme';

interface Props {
  item: Expense;
  isMultiSelect: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onLongPress: (item: Expense) => void;
}

export function ExpenseListItem({ item, isMultiSelect, isSelected, onToggleSelect, onLongPress }: Props) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, ...theme.shadows.sm as any },
        isMultiSelect && isSelected && { backgroundColor: theme.colors.primaryLight },
      ]}
      onPress={() => {
        if (isMultiSelect) {
          onToggleSelect(item.id);
        } else {
          router.push(`/expense/${item.id}`);
        }
      }}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      {isMultiSelect && (
        <View style={styles.checkboxContainer}>
          <View
            style={[
              styles.checkbox,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
              isSelected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
            ]}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} />}
          </View>
        </View>
      )}
      <View style={[styles.icon, { backgroundColor: theme.colors.primaryLight }]}>
        {item.source === 'ocr' ? (
          <Image
            source={require('../../../assets/icons/scan-receipt.png')}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
        )}
      </View>
      <View style={styles.details}>
        <Text style={[styles.description, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {item.description || 'Expense'}
        </Text>
        {item.merchant ? (
          <Text style={[styles.merchant, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {item.merchant}
          </Text>
        ) : null}
        <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
          {formatDate(item.date, undefined, getIntlLocale())}
        </Text>
      </View>
      <Text style={[styles.amount, { color: theme.colors.danger }]}>
        -{formatCurrency(item.amount, item.currencyCode)}
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
  checkboxContainer: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  merchant: {
    fontSize: 12,
    marginTop: 1,
  },
  date: {
    fontSize: 13,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
  },
});
