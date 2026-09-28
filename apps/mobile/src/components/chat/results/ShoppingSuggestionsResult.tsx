import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function ShoppingSuggestionsResult({
  data,
  desktop,
}: {
  data: Record<string, unknown>;
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  const restock = ((data.restock as any[]) || []).slice(0, 5);
  const deals = ((data.deals as any[]) || []).slice(0, 5);
  const restockTotal = (data.restock as any[])?.length || 0;
  const dealsTotal = (data.deals as any[])?.length || 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="basket-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionShoppingSuggestions')}</Text>
      </View>
      {restock.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('chat.shoppingSuggestionsRestock')}</Text>
          {restock.map((r: any, idx: number) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listItemText} numberOfLines={1}>
                {r.canonicalName}
              </Text>
              <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
                {r.dueInDays}d
              </Text>
            </View>
          ))}
          {restockTotal > 5 && (
            <Text style={styles.moreText}>{t('chat.andMore', { count: restockTotal - 5 })}</Text>
          )}
        </>
      )}
      {deals.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('chat.shoppingSuggestionsDeals')}</Text>
          {deals.map((d: any, idx: number) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.listItemText} numberOfLines={1}>
                {d.canonicalName}{d.merchant ? ` · ${d.merchant}` : ''}
              </Text>
              <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
                -{Number(d.dropPct ?? 0).toFixed(0)}% · {Number(d.price ?? 0).toFixed(2)} {d.currency}
              </Text>
            </View>
          ))}
          {dealsTotal > 5 && (
            <Text style={styles.moreText}>{t('chat.andMore', { count: dealsTotal - 5 })}</Text>
          )}
        </>
      )}
    </View>
  );
}
