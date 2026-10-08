import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { GroupSummary } from '@budget/shared-types';

interface GroupListRowProps {
  group: GroupSummary;
  onPress: () => void;
}

export function GroupListRow({ group, onPress }: GroupListRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const owed = group.myBalance >= 0.01;
  const owe = group.myBalance <= -0.01;
  const balanceText = owed
    ? t('groups.youAreOwed', { amount: formatCurrency(group.myBalance, group.currencyCode) })
    : owe
      ? t('groups.youOwe', { amount: formatCurrency(-group.myBalance, group.currencyCode) })
      : t('groups.heroSettled');
  const balanceColor = owed ? theme.colors.success : owe ? theme.colors.danger : theme.colors.textTertiary;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        {group.emoji ? (
          <Text style={styles.emoji}>{group.emoji}</Text>
        ) : (
          <Ionicons name="people-outline" size={22} color={theme.colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {t('groups.membersCount', { count: group.memberCount })}
          {group.status === 'archived' ? ` · ${t('groups.archivedBadge')}` : ''}
        </Text>
      </View>
      <Text style={[styles.balance, { color: balanceColor }]} numberOfLines={2}>
        {balanceText}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  meta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  balance: {
    ...theme.textStyles.bodySmMedium,
    maxWidth: 120,
    textAlign: 'right' as const,
  },
});
