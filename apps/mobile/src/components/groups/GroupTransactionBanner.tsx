import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { groupTransactionMark, resolveShareRowGroup } from '@/features/groups/groupBudgetMirror';

interface Row {
  source?: string | null;
  description?: string | null;
  isSplitReceivable?: boolean | null;
  isDebt?: boolean | null;
}

/**
 * On a transaction's detail (phone screen and the desktop dialog, both through the shared details
 * cards), ABA-661: a share row says it follows the group and links to it; a payment linked to a group
 * leg says why it is out of the totals. Renders nothing for every other row, so it is additive.
 * `onNavigate` runs before the group opens (the desktop dialog closes itself first).
 */
export function GroupTransactionBanner({
  row,
  kind,
  onNavigate,
}: {
  row: Row;
  kind: 'expense' | 'income';
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const mark = groupTransactionMark(row, kind);
  const groups = useGroupStore((s) => s.groups);
  const loadGroups = useGroupStore((s) => s.loadGroups);

  // The share row carries no group id; its name prefix is matched against my groups list.
  useEffect(() => {
    if (mark === 'share' && groups.length === 0) void loadGroups().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark]);

  if (!mark) return null;

  if (mark === 'linked') {
    return (
      <View style={styles.banner}>
        <Ionicons name="link-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.text}>
          {kind === 'income' ? t('groupBudget.linkedBannerIncome') : t('groupBudget.linkedBanner')}
        </Text>
      </View>
    );
  }

  const { groupId, name } = resolveShareRowGroup(row.description, groups);
  const open = () => {
    onNavigate?.();
    router.push((groupId ? `/groups/${groupId}` : '/groups') as never);
  };

  return (
    <View style={styles.banner}>
      <Ionicons name="people-outline" size={16} color={theme.colors.primary} />
      <View style={styles.flex}>
        <TouchableOpacity onPress={open} accessibilityRole="link">
          <Text style={styles.link}>
            {name ? t('groupBudget.fromGroup', { name }) : t('groupBudget.fromGroupUnknown')}
          </Text>
        </TouchableOpacity>
        <Text style={styles.text}>{t('groupBudget.shareFollowsGroup')}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  flex: {
    flex: 1,
    gap: theme.spacing[1],
  },
  link: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  text: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
