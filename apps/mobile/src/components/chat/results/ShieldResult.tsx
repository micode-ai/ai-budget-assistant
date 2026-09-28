import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

export function ShieldResult({ data, desktop }: { data: Record<string, unknown>; desktop: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);
  const items = (data.items as any[]) || [];
  const savedSoFar = Number(data.savedSoFar ?? 0);
  const baseCurrency = String(data.baseCurrency ?? '');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionInflationShield')}
          {savedSoFar > 0 ? ` · ${savedSoFar.toFixed(2)} ${baseCurrency}` : ''}
        </Text>
      </View>
      {items.slice(0, 5).map((it: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {it.canonicalName}{it.store ? ` · ${it.store}` : ''}
          </Text>
          <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
            +{Number(it.monthlyChangePct ?? 0).toFixed(0)}% · {Number(it.projectedSaving ?? 0).toFixed(2)} {baseCurrency}
          </Text>
        </View>
      ))}
      {items.length > 5 && (
        <Text style={styles.moreText}>{t('chat.andMore', { count: items.length - 5 })}</Text>
      )}
    </View>
  );
}
