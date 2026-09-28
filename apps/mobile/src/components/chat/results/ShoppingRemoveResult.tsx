import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function ShoppingRemoveResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  const removedLabels = (data.removedLabels as string[]) || [];
  const notFoundLabels = (data.notFoundLabels as string[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="remove-circle-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.headerText}>{t('chat.actionRemoveShoppingList')}</Text>
      </View>
      {removedLabels.map((label, idx) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="remove-circle-outline" size={16} color={theme.colors.danger} />
        </View>
      ))}
      {notFoundLabels.length > 0 && (
        <Text style={styles.moreText}>
          {t('chat.actionShoppingNotFound', { names: notFoundLabels.join(', ') })}
        </Text>
      )}
    </View>
  );
}
