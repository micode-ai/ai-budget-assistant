import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useStyles, type Theme } from '@/theme';
import type { ItemBreakdown } from '@/features/analytics/useAnalytics';

interface Props {
  itemBreakdown: ItemBreakdown[];
  currency: string;
}

export function TopReceiptItems({ itemBreakdown, currency }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.topItems')}</Text>
      {itemBreakdown.slice(0, 10).map((item, index) => (
        <View key={item.description} style={styles.topItemRow}>
          <View style={styles.topItemRank}>
            <Text style={styles.topItemRankText}>{index + 1}</Text>
          </View>
          <View style={styles.topItemInfo}>
            <Text style={styles.topItemName} numberOfLines={1}>{item.description}</Text>
            <Text style={styles.topItemMeta}>
              {t('analytics.itemPurchaseCount')}: {item.count}
            </Text>
          </View>
          <Text style={styles.topItemAmount}>
            {formatCurrency(item.totalSpent, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  topItemRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  topItemRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[3],
  },
  topItemRankText: {
    ...theme.textStyles.bodySmMedium,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  topItemInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  topItemName: {
    ...theme.textStyles.body,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    textTransform: 'capitalize' as const,
  },
  topItemMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  topItemAmount: {
    ...theme.textStyles.body,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
});
