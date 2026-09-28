import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';
import { RecentReceiptsSection, type RecentReceiptRow } from './RecentReceiptsSection';

/**
 * How much the user has been given in discounts (rabat, Rabatt, скидка) on
 * their purchases, and at which stores. Mirrors `DepositTotalResult`
 * deliberately — same reasoning, same shape, different figure.
 *
 * Renders nothing when there is no figure to show — a fully encrypted account
 * or an account with no discount on record. In both cases the assistant's own
 * sentence says which it is, and a card reading "0.00" would only contradict
 * it. The count is written as "x2" rather than a word so the card needs no
 * plural form in nine languages.
 */
export function DiscountTotalResult({ data, desktop }: { data: Record<string, unknown>; desktop: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);

  const receiptCount = Number(data.receiptCount ?? 0);
  if (data.encryptionRestricted || receiptCount === 0) return null;

  const total = Number(data.total ?? 0);
  const baseCurrency = String(data.baseCurrency ?? '');
  const merchants = (data.byMerchant as any[]) || [];
  const recent = (data.recent as RecentReceiptRow[]) || [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="pricetag-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>
          {t('chat.actionDiscountTotal')} · {total.toFixed(2)} {baseCurrency}
        </Text>
      </View>
      {merchants.map((m: any, idx: number) => (
        <View key={idx} style={styles.listItem}>
          <Text style={styles.listItemText} numberOfLines={1}>
            {m.merchant || '—'}
          </Text>
          <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
            {Number(m.amount ?? 0).toFixed(2)}
            {Number(m.receiptCount ?? 0) > 1 ? ` ×${m.receiptCount}` : ''}
          </Text>
        </View>
      ))}
      <RecentReceiptsSection recent={recent} desktop={desktop} />
    </View>
  );
}
