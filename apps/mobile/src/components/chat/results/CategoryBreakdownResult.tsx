import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function CategoryBreakdownResult({
  data,
  desktop,
}: {
  data: Record<string, unknown>;
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  const categories = (data.categories as any[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="stats-chart-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionGetCategoryBreakdown')}</Text>
      </View>
      {categories.slice(0, 8).map((cat: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {cat.categoryName || '—'}
          </Text>
          <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
            {Number(cat.amount || 0).toFixed(2)} ({Number(cat.percentage || 0).toFixed(0)}%)
          </Text>
        </View>
      ))}
    </View>
  );
}
