import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useGroupVoidSettlement } from '@/hooks/useGroupVoidSettlement';
import { useDesktopShortcut } from '@/hooks/useDesktopShortcuts';
import { resolveNextFocusedRow } from '@/features/expenses/rowKeyboardNav';
import { canModifyExpense, isGroupWritable, liveMembers } from '@/features/groups/groupDisplay';
import { canRecordPayment } from '@/features/groups/groupMath';
import { groupActivityByDay } from '@/features/groups/groupActivityTable';
import { expenseRowTarget } from '@/features/groups/groupItems';
import { WIDE_TABLE_MIN_WIDTH } from '@/components/webLayout.constants';
import type { GroupExpense, GroupTransfer } from '@budget/shared-types';
import { GroupBalanceHero } from '../GroupBalanceHero';
import { GroupBalancesCard } from '../GroupBalancesCard';
import { GroupBudgetLinksCard } from '../GroupBudgetLinksCard';
import { GroupErrorState } from '../GroupErrorState';
import { GroupShareCard } from '../GroupShareCard';
import { GroupTransfersCard } from '../GroupTransfersCard';
import { GroupOfflineBanner } from '../GroupOfflineBanner';
import { GroupOrphanBanner } from '../GroupOrphanBanner';
import { useConnectivity } from '@/hooks/useConnectivity';
import { GroupActivityTable } from './GroupActivityTable';
import { GroupDetailDialogs, type GroupDetailDialogState } from './GroupDetailDialogs';

const RAIL_WIDTH = 320;

interface Props {
  groupId: string;
  /** Set by the child routes (`/expense`, `/settle`, `/members`, `/claims`, `/budget-links`): open that dialog over the page. */
  initialDialog?: GroupDetailDialogState;
}

/**
 * Desktop group detail (ABA-646): a toolbar, a hero strip and an activity table in the main column,
 * and a 320px rail with who-pays-whom, balances and the invite link. Add / edit expense, settle and
 * members are dialogs hosting the existing views. One page scroll: the rail is NOT sticky (it can
 * be taller than the window).
 *
 * Groups are online-only, so nothing is drawn before `detail` has answered: a spinner (or the error
 * state) fills the frame, never a hero reading "all settled up" for a group we know nothing about.
 *
 * `GroupDetailDesktop` keeps all overlay state; `GroupDetailDialogs` only renders it.
 */
export function GroupDetailDesktop({ groupId, initialDialog }: Props) {
  const { t } = useTranslation();
  const { isOffline } = useConnectivity();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const showMyShare = width >= WIDE_TABLE_MIN_WIDTH;

  const { detail, activity, hasMore, isLoadingMore, loadFailed, reload, loadMore } = useGroupDetail(groupId);
  const confirmVoid = useGroupVoidSettlement(groupId);

  const [dialog, setDialog] = useState<GroupDetailDialogState | null>(initialDialog ?? null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const writable = isGroupWritable(detail);
  const { days, order } = useMemo(
    () => groupActivityByDay(activity, detail?.myMemberId ?? ''),
    [activity, detail?.myMemberId],
  );

  useEffect(() => {
    if (focusedRowId && !order.includes(focusedRowId)) setFocusedRowId(null);
  }, [focusedRowId, order]);

  const openExpense = (expense: GroupExpense) => setDialog({ kind: 'expense', expenseId: expense.id });
  // ABA-656: an itemised expense opens its lines; every member may claim, so this is not gated on edit rights.
  const openClaims = (expense: GroupExpense) => setDialog({ kind: 'claims', expenseId: expense.id });
  const openSettle = (transfer: GroupTransfer) =>
    setDialog({ kind: 'settle', from: transfer.fromMemberId, to: transfer.toMemberId });

  const closeDialog = () => {
    setDialog(null);
    // Opened from a child route: the route IS the dialog, so leave it for the page itself.
    if (initialDialog) router.replace(`/groups/${groupId}` as never);
  };
  const onLeftGroup = () => {
    setDialog(null);
    router.replace('/groups' as never);
  };

  const keyboardNavEnabled = dialog === null && !!detail;
  useDesktopShortcut('n', () => setDialog({ kind: 'expense' }), {
    enabled: keyboardNavEnabled && writable,
    description: t('shortcuts.newExpense'),
  });
  useDesktopShortcut(
    'arrowdown',
    () => setFocusedRowId((cur) => resolveNextFocusedRow(order, cur, 1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') },
  );
  useDesktopShortcut(
    'arrowup',
    () => setFocusedRowId((cur) => resolveNextFocusedRow(order, cur, -1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') },
  );
  useDesktopShortcut(
    'enter',
    () => {
      if (!detail || !focusedRowId) return;
      // A payment row is skipped: voiding is an explicit button, never a key press.
      const row = days.flatMap((d) => d.rows).find((r) => r.id === focusedRowId);
      if (!row || row.item.kind !== 'expense') return;
      const e = row.item.expense;
      const target = expenseRowTarget(e, canModifyExpense(detail, e), writable);
      if (target === 'claims') openClaims(e);
      else if (target === 'edit') openExpense(e);
    },
    { enabled: keyboardNavEnabled, description: t('shortcuts.openRow') },
  );

  if (!detail) {
    return (
      <View style={styles.root}>
        {loadFailed ? (
          <GroupErrorState onRetry={reload} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </View>
    );
  }

  const memberCount = liveMembers(detail).length;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: `${detail.emoji ? `${detail.emoji} ` : ''}${detail.name}` }} />

      <View style={styles.toolbar}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {detail.emoji ? `${detail.emoji} ` : ''}
            {detail.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            · {detail.currencyCode} · {t('groups.membersCount', { count: memberCount })}
          </Text>
          {!writable && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('groups.archivedBadge')}</Text>
            </View>
          )}
        </View>
        <View style={styles.toolbarRight}>
          <Pressable
            onPress={() => setDialog({ kind: 'members' })}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>{t('groups.membersAction')}</Text>
          </Pressable>
          {/* ABA-652: a partial payment, or one to a creditor who is not the suggested one. */}
          {writable && canRecordPayment(detail) && (
            <Pressable
              onPress={() => setDialog({ kind: 'settle' })}
              disabled={isOffline}
              accessibilityRole="button"
              accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
              style={[styles.secondaryButton, isOffline && { opacity: 0.55 }]}
            >
              <Text style={styles.secondaryButtonText}>{t('groups.recordPayment')}</Text>
            </Pressable>
          )}
          {writable && (
            <Pressable
              onPress={() => setDialog({ kind: 'expense' })}
              disabled={isOffline}
              accessibilityRole="button"
              accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
              style={[styles.primaryButton, isOffline && { opacity: 0.55 }]}
            >
              <Ionicons name="add" size={18} color={theme.colors.textInverse} />
              <Text style={styles.primaryButtonText}>{t('groups.addExpense')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {!writable && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('groups.archivedBanner')}</Text>
        </View>
      )}
      {loadFailed && (
        <View style={styles.banner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.bannerText}>{t('groups.loadError')}</Text>
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.bannerAction}>{t('groups.retry')}</Text>
          </Pressable>
        </View>
      )}

      <GroupOfflineBanner style={{ marginHorizontal: 24 }} />

      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          <View style={styles.mainColumn}>
            {/* ABA-650: no owner. Above the hero, so it reads before the money. */}
            <GroupOrphanBanner detail={detail} style={{ marginBottom: 0 }} />
            <GroupBalanceHero detail={detail} desktop />
            <Text style={styles.sectionTitle}>{t('groups.activityTitle')}</Text>
            <GroupActivityTable
              detail={detail}
              days={days}
              hasMore={hasMore}
              loadingMore={isLoadingMore}
              canWrite={writable}
              showMyShare={showMyShare}
              focusedRowId={focusedRowId}
              keyboardNavEnabled={keyboardNavEnabled}
              onFocusRow={setFocusedRowId}
              onLoadMore={() => void loadMore().catch(() => undefined)}
              onOpenExpense={openExpense}
              onOpenClaims={openClaims}
              onVoidSettlement={confirmVoid}
            />
          </View>

          <View style={styles.rail}>
            <GroupTransfersCard detail={detail} canSettle={writable} onSettle={openSettle} />
            <GroupBalancesCard detail={detail} />
            {/* ABA-661: "may be counted twice"; nothing while the budget mirror is off. */}
            <GroupBudgetLinksCard groupId={groupId} onReview={() => setDialog({ kind: 'budgetLinks' })} />
            {writable && <GroupShareCard detail={detail} desktop />}
          </View>
        </View>
      </ScrollView>

      <GroupDetailDialogs
        groupId={groupId}
        dialog={dialog}
        onClose={closeDialog}
        onLeftGroup={onLeftGroup}
        onSwitch={setDialog}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  // Paints its own ground: a bare `flex: 1` is transparent and React Navigation's default
  // light grey would show through under dark-theme text.
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[2],
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
  },
  badge: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  badgeText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  toolbarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
  },
  primaryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
  },
  secondaryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textPrimary,
  },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.warningLight,
  },
  bannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  bannerAction: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  body: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[4],
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  rail: {
    width: RAIL_WIDTH,
    gap: theme.spacing[3],
  },
});
