import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { myPosition } from '@/features/groups/groupMath';
import type { GroupDetail } from '@budget/shared-types';

/** The signed headline: what I am owed, what I owe, or "all settled up", plus my monthly share. */
export function GroupBalanceHero({ detail }: { detail: GroupDetail }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { owed, owe } = myPosition(detail);

  const settled = owed < 0.01 && owe < 0.01;
  const label = settled ? t('groups.heroSettled') : owed >= 0.01 ? t('groups.heroOwed') : t('groups.heroOwe');
  const color = settled ? theme.colors.textSecondary : owed >= 0.01 ? theme.colors.success : theme.colors.danger;

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
