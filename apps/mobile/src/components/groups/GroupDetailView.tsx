import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useGroupVoidSettlement } from '@/hooks/useGroupVoidSettlement';
import { useTheme, useStyles, type Theme } from '@/theme';
import { isGroupWritable } from '@/features/groups/groupDisplay';
import type { GroupExpense, GroupTransfer } from '@budget/shared-types';
import { GroupActivityList } from './GroupActivityList';
import { GroupBalanceHero } from './GroupBalanceHero';
import { GroupButton } from './GroupButton';
import { GroupErrorState } from './GroupErrorState';
import { GroupShareCard } from './GroupShareCard';
import { GroupTransfersCard } from './GroupTransfersCard';

/** One group: balance hero, transfers, activity, invite link, and the entry points to the rest. */
export function GroupDetailView({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { detail, activity, hasMore, isLoading, isLoadingMore, loadFailed, reload, loadMore } =
    useGroupDetail(groupId);
  const confirmVoid = useGroupVoidSettlement(groupId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  if (!detail) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {loadFailed ? (
          <GroupErrorState onRetry={reload} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const writable = isGroupWritable(detail);

  const openSettle = (transfer: GroupTransfer) =>
    router.push({
      pathname: `/groups/${groupId}/settle`,
      params: {
        from: transfer.fromMemberId,
        to: transfer.toMemberId,
        amount: String(transfer.amount),
      },
    } as never);

  const openExpense = (expense: GroupExpense) =>
    router.push({ pathname: `/groups/${groupId}/expense`, params: { expenseId: expense.id } } as never);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: `${detail.emoji ? `${detail.emoji} ` : ''}${detail.name}` }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
      >
        {!writable && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t('groups.archivedBanner')}</Text>
          </View>
        )}

        <GroupBalanceHero detail={detail} />

        {writable && (
          <View style={styles.buttonRow}>
            <GroupButton
              label={t('groups.addExpense')}
              onPress={() => router.push(`/groups/${groupId}/expense` as never)}
              style={styles.rowButton}
            />
            <GroupButton
              label={t('groups.membersAction')}
              onPress={() => router.push(`/groups/${groupId}/members` as never)}
              variant="secondary"
              style={styles.rowButton}
            />
          </View>
        )}
        {!writable && (
          <GroupButton
            label={t('groups.membersAction')}
            onPress={() => router.push(`/groups/${groupId}/members` as never)}
            variant="secondary"
            style={styles.gap}
          />
        )}

        <View style={styles.gap}>
          <GroupTransfersCard detail={detail} canSettle={writable} onSettle={openSettle} />
        </View>
        <View style={styles.gap}>
          <GroupActivityList
            detail={detail}
            items={activity}
            hasMore={hasMore}
            loadingMore={isLoadingMore}
            canWrite={writable}
            onLoadMore={() => void loadMore().catch(() => undefined)}
            onOpenExpense={openExpense}
            onVoidSettlement={confirmVoid}
          />
        </View>
        {writable && (
          <View style={styles.gap}>
            <GroupShareCard detail={detail} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  banner: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  bannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  rowButton: {
    flex: 1,
  },
  gap: {
    marginTop: theme.spacing[3],
  },
});
