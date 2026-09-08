import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useStyles, type Theme } from '@/theme';
import type { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';

/**
 * Own wide card, the same 10 ranked rows `TopReceiptItems` shows on mobile
 * laid out as two columns of 5 instead of one column of 10 — a phone has to
 * scroll a list of 10, a wide window can show all of it without scrolling
 * further. Built fresh (not a wrapped `TopReceiptItems`) since that component
 * has no two-column layout of its own to opt into — same "adapter, don't
 * touch the mobile component" precedent `BreakdownCard`'s adapters follow.
 */
export function TopItemsCard({
  itemBreakdown,
  currency,
}: {
  itemBreakdown: ReturnType<typeof useAnalyticsScreenData>['itemBreakdown'];
  currency: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const top10 = itemBreakdown.slice(0, 10);
  const columnA = top10.slice(0, 5);
  const columnB = top10.slice(5, 10);

  const renderColumn = (items: typeof top10, startIndex: number) => (
    <View style={styles.topItemsColumn}>
      {items.map((item, i) => (
        <View key={item.description} style={styles.topItemRow}>
          <View style={styles.topItemRank}>
            <Text style={styles.topItemRankText}>{startIndex + i + 1}</Text>
          </View>
          <View style={styles.topItemInfo}>
            <Text style={styles.topItemName} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.topItemMeta}>
              {t('analytics.itemPurchaseCount')}: {item.count}
            </Text>
          </View>
          <Text style={styles.topItemAmount}>{formatCurrency(item.totalSpent, currency)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.topItemsCard}>
      <Text style={styles.topItemsTitle}>{t('analytics.topItems')}</Text>
      <View style={styles.topItemsColumns}>
        {renderColumn(columnA, 0)}
        {columnB.length > 0 && renderColumn(columnB, 5)}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  topItemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  topItemsTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  topItemsColumns: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
  },
  topItemsColumn: {
    flex: 1,
    minWidth: 0,
  },
  topItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  topItemRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[2.5],
    flexShrink: 0,
  },
  topItemRankText: {
    ...theme.textStyles.caption,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  topItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  topItemName: {
    ...theme.textStyles.bodySm,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  topItemMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  topItemAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
});
