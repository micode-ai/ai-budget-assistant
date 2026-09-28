import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function ShoppingAddResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  const items = (data.items as string[]) || [];
  const listName = String(data.listName ?? '');

  return (
    <View style={[styles.card, styles.successCard]}>
      <View style={styles.header}>
        <Ionicons name="cart" size={18} color={theme.colors.success} />
        <Text style={[styles.headerText, { color: theme.colors.success }]}>
          {t('chat.actionAddShoppingList')}
          {listName ? ` · ${listName}` : ''}
        </Text>
      </View>
      {items.map((label, idx) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
        </View>
      ))}
    </View>
  );
}
