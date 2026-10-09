import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { myPosition } from '@/features/groups/groupMath';
import type { GroupDetail } from '@budget/shared-types';

/**
 * The signed headline: what I am owed, what I owe, or "all settled up", plus my monthly share.
 * `desktop` (ABA-646, default false so the phone call is unchanged) lays the same two facts out as
 * a left-aligned row of tiles for the wide detail page instead of a centred column.
 */
export function GroupBalanceHero({ detail, desktop = false }: { detail: GroupDetail; desktop?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { owed, owe } = myPosition(detail);

  const settled = owed < 0.01 && owe < 0.01;
  const label = settled ? t('groups.heroSettled') : owed >= 0.01 ? t('groups.heroOwed') : t('groups.heroOwe');
  const color = settled ? theme.colors.textSecondary : owed >= 0.01 ? theme.colors.success : theme.colors.danger;

  if (desktop) {
    return (
      <View style={styles.strip}>
        <View style={styles.tile}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.tileValue, { color: settled ? theme.colors.textSecondary : color }]}>
            {settled
              ? formatCurrency(0, detail.currencyCode)
              : formatCurrency(owed >= 0.01 ? owed : owe, detail.currencyCode)}
          </Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>{t('groups.myShareThisMonth')}</Text>
          <Text style={[styles.tileValue, { color: theme.colors.textPrimary }]}>
            {formatCurrency(detail.myShareThisMonth, detail.currencyCode)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {!settled && (
        <Text style={[styles.amount, { color }]}>
          {formatCurrency(owed >= 0.01 ? owed : owe, detail.currencyCode)}
        </Text>
      )}
      <View style={styles.shareRow}>
        <Text style={styles.shareLabel}>{t('groups.myShareThisMonth')}</Text>
        <Text style={styles.shareValue}>{formatCurrency(detail.myShareThisMonth, detail.currencyCode)}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  strip: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  tile: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  tileValue: {
    ...theme.textStyles.h2,
    marginTop: theme.spacing[1],
    fontVariant: ['tabular-nums' as const],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  amount: {
    ...theme.textStyles.h1,
    marginTop: theme.spacing[1],
  },
  shareRow: {
    alignSelf: 'stretch' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  shareLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  shareValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
});
