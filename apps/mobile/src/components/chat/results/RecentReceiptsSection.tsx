import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

/** A row of `DepositTotalResult`/`DiscountTotalResult`'s "Recent" list — no
 *  shared DTO exists for this shape in `@budget/shared-types` (it's an
 *  ad-hoc slice of `AiToolsService`'s deposit/discount-total response, not a
 *  standalone entity), so it's defined locally here. */
export interface RecentReceiptRow {
  merchant?: string;
  date?: string;
  amount?: number;
  expenseId?: string;
}

/**
 * The "Recent" tap-through list shared by `DepositTotalResult`/
 * `DiscountTotalResult` — reuses `analytics.savingsDetailRecent` (no new
 * i18n key) and mirrors `SavingsDetailSheet.tsx`'s recent-receipts row
 * exactly: disabled + no chevron when a row has no `expenseId` (rare, an
 * underlying row with no id), tappable through to `/expense/:id` otherwise.
 */
export function RecentReceiptsSection({
  recent,
  desktop,
}: {
  recent: RecentReceiptRow[];
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);

  if (recent.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionLabel}>{t('analytics.savingsDetailRecent')}</Text>
      {recent.map((r, idx) => (
        <TouchableOpacity
          key={idx}
          style={styles.listItem}
          disabled={!r.expenseId}
          onPress={() => r.expenseId && router.push(`/expense/${r.expenseId}` as any)}
        >
          <View style={styles.recentTextWrap}>
            <Text style={styles.listItemText} numberOfLines={1}>
              {r.merchant || '—'}
            </Text>
            <Text style={styles.recentDate}>{r.date}</Text>
          </View>
          <Text style={[styles.listItemAmount, desktop && styles.listItemAmountDesktop]}>
            {Number(r.amount ?? 0).toFixed(2)}
          </Text>
          {!!r.expenseId && (
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
          )}
        </TouchableOpacity>
      ))}
    </>
  );
}
