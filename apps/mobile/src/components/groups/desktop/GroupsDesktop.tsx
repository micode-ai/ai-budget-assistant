import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useGroupStore } from '@/stores/groupStore';
import { useDesktopShortcut } from '@/hooks/useDesktopShortcuts';
import { resolveNextFocusedRow } from '@/features/expenses/rowKeyboardNav';
import { groupsTotalsByCurrency, sortGroupsForTable } from '@/features/groups/groupListTable';
import { WIDE_TABLE_MIN_WIDTH } from '@/components/webLayout.constants';
import { GroupButton } from '../GroupButton';
import { GroupOfflineBanner } from '../GroupOfflineBanner';
import { useConnectivity } from '@/hooks/useConnectivity';
import { GroupErrorState } from '../GroupErrorState';
import { GroupsDesktopDialogs, type GroupsDialog } from './GroupsDesktopDialogs';
import type { GroupSummary } from '@budget/shared-types';

interface Props {
  /** Set by the `/groups/new` and `/groups/join` routes: open that dialog over the list. */
  initialDialog?: Exclude<GroupsDialog, null>;
  initialLink?: string;
}

/**
 * Desktop groups list (ABA-646): a toolbar, a per-currency summary strip and a table, with the
 * create and join forms in dialogs. Groups are online-only and server-only, so nothing here is ever
 * drawn from a local copy and a balance is never shown before the list has answered: the strip shows
 * dashes while loading, and a failed first load is an error state, not an empty list.
 *
 * `GroupsDesktop` keeps all overlay state; `GroupsDesktopDialogs` only renders it.
 */
export function GroupsDesktop({ initialDialog, initialLink }: Props) {
  const { t } = useTranslation();
  const { isOffline } = useConnectivity();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const showCurrency = width >= WIDE_TABLE_MIN_WIDTH;

  const groups = useGroupStore((s) => s.groups);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [dialog, setDialog] = useState<GroupsDialog>(initialDialog ?? null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadGroups();
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadedOnce(true);
      setRefreshing(false);
    }
  }, [loadGroups]);

  // Balances change from other screens (settle, add expense) and from guests, so refresh on focus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo(() => sortGroupsForTable(groups), [groups]);
  const order = useMemo(() => rows.map((g) => g.id), [rows]);
  const totals = useMemo(() => groupsTotalsByCurrency(groups), [groups]);

  useEffect(() => {
    if (focusedId && !order.includes(focusedId)) setFocusedId(null);
  }, [focusedId, order]);

  const closeDialog = () => {
    setDialog(null);
    // Opened from a deep link: the route IS the dialog, so leave it for the list.
    if (initialDialog) router.replace('/groups' as never);
  };
  const openGroup = (id: string) => router.push(`/groups/${id}` as never);
  const onDialogOpenGroup = (id: string) => {
    setDialog(null);
    if (initialDialog) router.replace(`/groups/${id}` as never);
    else openGroup(id);
  };

  const keyboardNavEnabled = dialog === null;
  useDesktopShortcut('n', () => setDialog('new'), {
    enabled: keyboardNavEnabled,
    description: t('shortcuts.newGroup'),
  });
  useDesktopShortcut(
    'arrowdown',
    () => setFocusedId((cur) => resolveNextFocusedRow(order, cur, 1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') },
  );
  useDesktopShortcut(
    'arrowup',
    () => setFocusedId((cur) => resolveNextFocusedRow(order, cur, -1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') },
  );
  useDesktopShortcut(
    'enter',
    () => {
      if (focusedId) openGroup(focusedId);
    },
    { enabled: keyboardNavEnabled, description: t('shortcuts.openRow') },
  );

  const loading = !loadedOnce;
  const noData = rows.length === 0;

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    if (loadFailed && noData) {
      return (
        <View style={styles.stateBox}>
          <GroupErrorState onRetry={load} />
        </View>
      );
    }
    if (noData) {
      return (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={56} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('groups.listEmpty')}</Text>
          <Text style={styles.emptyHint}>{t('groups.listEmptyHint')}</Text>
          <View style={styles.emptyActions}>
            <GroupButton label={t('groups.newGroup')} onPress={() => setDialog('new')} write style={styles.emptyButton} />
            <GroupButton
              label={t('groups.joinWithLink')}
              onPress={() => setDialog('join')}
              variant="secondary"
              write
              style={styles.emptyButton}
            />
          </View>
        </View>
      );
    }
    return rows.map((g) => (
      <GroupTableRow
        key={g.id}
        group={g}
        showCurrency={showCurrency}
        hovered={hoveredId === g.id}
        keyboardFocused={keyboardNavEnabled && focusedId === g.id}
        onHover={(on) => setHoveredId((cur) => (on ? g.id : cur === g.id ? null : cur))}
        onPress={() => {
          setFocusedId(g.id);
          openGroup(g.id);
        }}
      />
    ));
  };

  const dash = '—';

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('groups.title')}</Text>
          {loadedOnce && !noData && <Text style={styles.count}>({rows.length})</Text>}
        </View>
        <View style={styles.toolbarRight}>
          <Pressable
            onPress={() => setDialog('join')}
            disabled={isOffline}
            accessibilityRole="button"
            accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
            style={[styles.secondaryButton, isOffline && { opacity: 0.55 }]}
          >
            <Text style={styles.secondaryButtonText}>{t('groups.joinWithLink')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setDialog('new')}
            disabled={isOffline}
            accessibilityRole="button"
            accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
            style={[styles.primaryButton, isOffline && { opacity: 0.55 }]}
          >
            <Ionicons name="add" size={18} color={theme.colors.textInverse} />
            <Text style={styles.primaryButtonText}>{t('groups.newGroup')}</Text>
          </Pressable>
        </View>
      </View>

      {loadFailed && !noData && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.errorBannerText}>{t('groups.loadError')}</Text>
          <Pressable onPress={load} accessibilityRole="button" disabled={refreshing}>
            <Text style={styles.errorBannerAction}>{t('groups.retry')}</Text>
          </Pressable>
        </View>
      )}

      <GroupOfflineBanner style={{ marginHorizontal: 24 }} />

      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        {/* Never blend currencies, and never draw a total before the list has answered. */}
        {(loading || (!noData && totals.length > 0)) && (
          <View style={styles.strip}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{t('groups.heroOwed')}</Text>
              {loading ? (
                <Text style={[styles.tileValue, { color: theme.colors.textTertiary }]}>{dash}</Text>
              ) : (
                totals.map((c) => (
                  <Text
                    key={c.currencyCode}
                    style={[styles.tileValue, { color: c.owed > 0 ? theme.colors.success : theme.colors.textTertiary }]}
                  >
                    {formatCurrency(c.owed, c.currencyCode)}
                  </Text>
                ))
              )}
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{t('groups.heroOwe')}</Text>
              {loading ? (
                <Text style={[styles.tileValue, { color: theme.colors.textTertiary }]}>{dash}</Text>
              ) : (
                totals.map((c) => (
                  <Text
                    key={c.currencyCode}
                    style={[styles.tileValue, { color: c.owe > 0 ? theme.colors.danger : theme.colors.textTertiary }]}
                  >
                    {formatCurrency(c.owe, c.currencyCode)}
                  </Text>
                ))
              )}
            </View>
          </View>
        )}

        <View style={styles.table}>
          {/* Header row: a sticky plain View in the page scroll, never inside a horizontal scroller
              (that would be a scroll container on both axes and `sticky` would never stick). */}
          <View style={styles.headerRow}>
            <View style={styles.cellName}>
              <Text style={styles.headerText}>{t('groups.nameLabel')}</Text>
            </View>
            <View style={styles.cellMembers}>
              <Text style={styles.headerText}>{t('groups.membersTitle')}</Text>
            </View>
            {showCurrency && (
              <View style={styles.cellCurrency}>
                <Text style={styles.headerText}>{t('groups.currencyLabel')}</Text>
              </View>
            )}
            <View style={styles.cellBalance}>
              <Text style={[styles.headerText, styles.alignRight]}>{t('groups.colBalance')}</Text>
            </View>
          </View>
          {renderBody()}
        </View>
      </ScrollView>

      <GroupsDesktopDialogs
        dialog={dialog}
        initialLink={initialLink}
        onClose={closeDialog}
        onOpenGroup={onDialogOpenGroup}
      />
    </View>
  );
}

function GroupTableRow({
  group,
  showCurrency,
  hovered,
  keyboardFocused,
  onHover,
  onPress,
}: {
  group: GroupSummary;
  showCurrency: boolean;
  hovered: boolean;
  keyboardFocused: boolean;
  onHover: (on: boolean) => void;
  onPress: () => void;
}) {
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
    <Pressable
      onPress={onPress}
      onHoverIn={() => onHover(true)}
      onHoverOut={() => onHover(false)}
      accessibilityRole="button"
      style={[styles.row, hovered && styles.rowHovered, keyboardFocused && styles.rowKeyboardFocused]}
    >
      <View style={[styles.cellName, styles.nameInner]}>
        <View style={styles.avatar}>
          {group.emoji ? (
            <Text style={styles.emoji}>{group.emoji}</Text>
          ) : (
            <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
          )}
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        {group.status === 'archived' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('groups.archivedBadge')}</Text>
          </View>
        )}
      </View>
      <View style={styles.cellMembers}>
        <Text style={styles.cellText}>{group.memberCount}</Text>
      </View>
      {showCurrency && (
        <View style={styles.cellCurrency}>
          <Text style={styles.cellText}>{group.currencyCode}</Text>
        </View>
      )}
      <View style={styles.cellBalance}>
        <Text style={[styles.balance, { color: balanceColor }]} numberOfLines={1}>
          {balanceText}
        </Text>
      </View>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  // Paints its own ground: a bare `flex: 1` is transparent and React Navigation's default
  // light grey would show through under dark-theme text.
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  count: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
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
  errorBanner: {
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
  errorBannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  errorBannerAction: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing[6],
  },
  strip: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
  },
  tile: {
    flexGrow: 1,
    flexBasis: 240,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  tileLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  tileValue: {
    ...theme.textStyles.h3,
    fontVariant: ['tabular-nums' as const],
  },
  table: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    // Sticks to the top of the ONE page scroll; needs an opaque ground and a zIndex or the rows
    // paint over it. `sticky` is web-only and this file is only reached from `.web.tsx` deciders.
    position: 'sticky' as unknown as 'absolute',
    top: 0,
    zIndex: 2,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  headerText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  alignRight: {
    textAlign: 'right' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    // Reserved so the keyboard-cursor mark never shifts the row's width.
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowKeyboardFocused: {
    borderLeftColor: theme.colors.primary,
  },
  cellName: {
    flex: 1,
    minWidth: 200,
    paddingRight: theme.spacing[2],
  },
  nameInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
  },
  cellMembers: {
    width: 120,
  },
  cellCurrency: {
    width: 100,
  },
  cellBalance: {
    width: 200,
    alignItems: 'flex-end' as const,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emoji: {
    fontSize: 16,
  },
  name: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  badge: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  badgeText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  cellText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  balance: {
    ...theme.textStyles.bodySmMedium,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  stateBox: {
    minHeight: 240,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  empty: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  emptyHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  emptyActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  emptyButton: {
    minWidth: 160,
  },
});
