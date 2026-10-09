import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { balanceOf, liveMembers } from '@/features/groups/groupDisplay';
import type { GroupDetail } from '@budget/shared-types';

/**
 * Each live member's net position, signed and coloured. Read-only: a desktop-rail companion to
 * "Who pays whom" so the ledger and the settlements are on one screen (ABA-646). Same colour rule
 * as the members screen (`success` owed, `danger` owes, `textTertiary` settled).
 */
export function GroupBalancesCard({ detail }: { detail: GroupDetail }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.balancesTitle')}</Text>
      {liveMembers(detail).map((m) => {
        const balance = balanceOf(detail, m.id);
        const color =
          balance >= 0.01 ? theme.colors.success : balance <= -0.01 ? theme.colors.danger : theme.colors.textTertiary;
        return (
          <View key={m.id} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {m.displayName}
              {m.id === detail.myMemberId ? ` · ${t('groups.youTag')}` : ''}
            </Text>
            <Text style={[styles.amount, { color }]}>
              {balance >= 0.01 ? '+' : ''}
              {formatCurrency(balance, detail.currencyCode)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  name: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  amount: {
    ...theme.textStyles.bodySmMedium,
    fontVariant: ['tabular-nums' as const],
  },
});
