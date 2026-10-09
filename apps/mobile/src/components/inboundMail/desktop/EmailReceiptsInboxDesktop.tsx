import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Currency, InboundReceiptListItem } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { getIntlLocale } from '@/i18n';
import { useAccountStore } from '@/stores/accountStore';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';
import { canRetry, handledReasonKey, visibleReceipts } from '@/features/inboundMail/inboundMail';
import { resolveNextFocusedRow } from '@/features/expenses/rowKeyboardNav';
import { useDesktopShortcut } from '@/hooks/useDesktopShortcuts';
import { FACET_RAIL_MIN_WIDTH, WIDE_TABLE_MIN_WIDTH } from '@/components/webLayout.constants';
import { CreateDialog } from '@/components/expenses/desktop/CreateDialog';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';
import { EmailReceiptDialog } from './EmailReceiptDialog';

type Segment = 'pending' | 'handled';

const INBOX_ROUTE = '/inbox/email-receipts';
const RAIL_WIDTH = 300;

/**
 * The desktop e-mail receipts inbox (ABA-646): a toolbar with a two-segment control, a table of
 * items and a rail with the private forwarding address. A row opens `EmailReceiptDialog`, which
 * hosts the existing confirm card; "Edit" there hands off to `CreateDialog` from this page, so two
 * dialogs are never open at once.
 *
 * Online-only by design (the items are server-born), so an empty list never stands in for a failed
 * load: a spinner while loading with nothing to show, the `loadFailed` message when the load failed
 * and there are no rows, and a banner when it failed but rows are held.
 *
 * `openId` is set by the `/inbox/email-receipt?id=` route (a push deep link); closing then replaces
 * that route with the inbox itself.
 */
export function EmailReceiptsInboxDesktop({ openId: initialOpenId }: { openId?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const railBesideTable = width >= FACET_RAIL_MIN_WIDTH;
  const showFrom = width >= WIDE_TABLE_MIN_WIDTH;

  const [segment, setSegment] = useState<Segment>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [editPrefill, setEditPrefill] = useState<ExpenseCreatePrefill | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const availability = useInboundReceiptStore((s) => s.availability);
  const pending = useInboundReceiptStore((s) => s.pending);
  const handled = useInboundReceiptStore((s) => s.handled);
  const locallySaved = useInboundReceiptStore((s) => s.locallySaved);
  const isLoading = useInboundReceiptStore((s) => s.isLoading);
  const error = useInboundReceiptStore((s) => s.error);
  const address = useInboundReceiptStore((s) => s.address);
  const waitingCode = address?.pendingVerification?.code;

  // Stops with the route: `useFocusEffect` only runs while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      const store = useInboundReceiptStore.getState();
      void store.loadInbox();
      void store.loadAddress();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentAccountId]),
  );

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const pendingItems = useMemo(() => visibleReceipts(pending, 'pending', locallySaved), [pending, locallySaved]);
  const handledItems = useMemo(() => visibleReceipts(handled, 'handled', locallySaved), [handled, locallySaved]);
  const items = segment === 'pending' ? pendingItems : handledItems;
  const order = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    if (focusedRowId && !order.includes(focusedRowId)) setFocusedRowId(null);
  }, [focusedRowId, order]);

  const fromRoute = !!initialOpenId;
  const leaveRoute = () => {
    if (fromRoute) router.replace(INBOX_ROUTE as never);
  };
  const closeConfirm = () => {
    setOpenId(null);
    leaveRoute();
  };
  const handleEdit = (prefill: ExpenseCreatePrefill) => {
    // Close the confirm dialog first: never a dialog on top of a dialog.
    setOpenId(null);
    setEditPrefill(prefill);
  };
  const closeCreate = () => {
    setEditPrefill(null);
    leaveRoute();
  };

  const isPendingSegment = segment === 'pending';
  const openable = isPendingSegment && canEdit;

  const guarded = async (item: InboundReceiptListItem, action: () => Promise<void>) => {
    setBusyId(item.id);
    try {
      await action();
    } catch {
      showAlert(t('common.error'), t('emailReceipts.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDismiss = (item: InboundReceiptListItem) =>
    showAlert(t('emailReceipts.dismissConfirmTitle'), t('emailReceipts.dismissConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('emailReceipts.dismiss'),
        style: 'destructive',
        onPress: () => void guarded(item, () => useInboundReceiptStore.getState().dismiss(item.id)),
      },
    ]);

  const keyboardNavEnabled = !openId && !editPrefill && availability !== 'unavailable';
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
      if (focusedRowId && openable) setOpenId(focusedRowId);
    },
    { enabled: keyboardNavEnabled, description: t('shortcuts.openRow') },
  );

  const copyAddress = async () => {
    if (!address) return;
    try {
      await Clipboard.setStringAsync(address.address);
      setCopied(true);
    } catch (e) {
      console.warn('[EmailReceiptsInboxDesktop] copy failed', e);
    }
  };

  if (availability === 'unavailable') {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.centeredText}>{t('emailReceipts.unavailable')}</Text>
        </View>
      </View>
    );
  }

  const renderRow = (item: InboundReceiptListItem) => {
    const busy = busyId === item.id;
    const hovered = hoveredId === item.id;
    const keyboardFocused = keyboardNavEnabled && focusedRowId === item.id;
    const total =
      item.total != null && item.currencyCode ? formatCurrency(item.total, item.currencyCode as Currency) : null;
    const date = item.date ? new Date(`${item.date}T12:00:00`).toLocaleDateString(getIntlLocale()) : null;

    return (
      <Pressable
        key={item.id}
        disabled={!openable}
        onPress={() => {
          setFocusedRowId(item.id);
          setOpenId(item.id);
        }}
        onHoverIn={() => setHoveredId(item.id)}
        onHoverOut={() => setHoveredId((cur) => (cur === item.id ? null : cur))}
        accessibilityRole={openable ? 'button' : undefined}
        style={[styles.row, hovered && openable && styles.rowHovered, keyboardFocused && styles.rowKeyboardFocused]}
      >
        <View style={styles.cellMerchant}>
          <Text style={styles.merchantText} numberOfLines={1}>
            {item.merchant ?? item.fromDomain}
          </Text>
        </View>
        <View style={styles.cellSubject}>
          <Text style={styles.cellText} numberOfLines={1}>
            {item.subject ?? t('emailReceipts.noSubject')}
          </Text>
          {!isPendingSegment && (
            <Text style={styles.reason} numberOfLines={2}>
              {t(`emailReceipts.${handledReasonKey(item)}`)}
            </Text>
          )}
        </View>
        {showFrom && (
          <View style={styles.cellFrom}>
            <Text style={styles.cellMuted} numberOfLines={1}>
              {item.fromDomain}
            </Text>
          </View>
        )}
        <View style={styles.cellDate}>
          <Text style={styles.cellMuted}>{date ?? ''}</Text>
        </View>
        <View style={styles.cellTotal}>
          <Text style={styles.totalText}>{total ?? ''}</Text>
        </View>
        <View style={styles.cellActions}>
          {canEdit &&
            (busy ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                {isPendingSegment && (
                  <Pressable
                    onPress={() => {
                      setFocusedRowId(item.id);
                      setOpenId(item.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('emailReceipts.review')}
                    style={styles.reviewButton}
                  >
                    <Text style={styles.reviewButtonText}>{t('emailReceipts.review')}</Text>
                  </Pressable>
                )}
                {!isPendingSegment && canRetry(item) && (
                  <Pressable
                    onPress={() => void guarded(item, () => useInboundReceiptStore.getState().retry(item.id))}
                    accessibilityRole="button"
                    accessibilityLabel={t('emailReceipts.retry')}
                    style={styles.iconButton}
                  >
                    <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => confirmDismiss(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('emailReceipts.dismiss')}
                  style={styles.iconButton}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
                </Pressable>
              </>
            ))}
        </View>
      </Pressable>
    );
  };

  const renderBody = () => {
    if (items.length > 0) return items.map(renderRow);
    if (isLoading) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.stateBox}>
        <Ionicons name="mail-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={styles.centeredText}>
          {error
            ? t('emailReceipts.loadFailed')
            : t(isPendingSegment ? 'emailReceipts.emptyPending' : 'emailReceipts.emptyHandled')}
        </Text>
        <Text style={styles.hint}>{t('emailReceipts.offlineNote')}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>{t('emailReceipts.inboxTitle')}</Text>
        <View style={styles.segments}>
          {(['pending', 'handled'] as const).map((value) => {
            const active = segment === value;
            return (
              <Pressable
                key={value}
                onPress={() => setSegment(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(value === 'pending' ? 'emailReceipts.segmentPending' : 'emailReceipts.segmentHandled')}
                  {value === 'pending' && pendingItems.length > 0 ? ` ${pendingItems.length}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.toolbarRight}>
          {isLoading && items.length > 0 && <ActivityIndicator size="small" color={theme.colors.primary} />}
          <Pressable
            onPress={() => void useInboundReceiptStore.getState().loadInbox()}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            style={styles.iconButton}
          >
            <Ionicons name="refresh-outline" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {waitingCode && (
        <Pressable
          onPress={() => router.push('/settings/email-receipts' as never)}
          accessibilityRole="button"
          style={styles.codeNotice}
        >
          <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.codeNoticeText}>{t('emailReceipts.verificationWaiting')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </Pressable>
      )}
      {error && items.length > 0 && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.errorBannerText}>{t('emailReceipts.loadFailed')}</Text>
        </View>
      )}

      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={[styles.body, !railBesideTable && styles.bodyStacked]}>
          <View style={styles.mainColumn}>
            <View style={styles.table}>
              <View style={styles.headerRow}>
                <View style={styles.cellMerchant}>
                  <Text style={styles.headerText}>{t('emailReceipts.colMerchant')}</Text>
                </View>
                <View style={styles.cellSubject}>
                  <Text style={styles.headerText}>{t('emailReceipts.colSubject')}</Text>
                </View>
                {showFrom && (
                  <View style={styles.cellFrom}>
                    <Text style={styles.headerText}>{t('emailReceipts.colFrom')}</Text>
                  </View>
                )}
                <View style={styles.cellDate}>
                  <Text style={styles.headerText}>{t('expensesDesktop.colDate')}</Text>
                </View>
                <View style={styles.cellTotal}>
                  <Text style={[styles.headerText, styles.alignRight]}>{t('emailReceipts.colTotal')}</Text>
                </View>
                <View style={styles.cellActions} />
              </View>
              {renderBody()}
            </View>
          </View>

          {address && (
            <View style={[styles.rail, !railBesideTable && styles.railStacked]}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('emailReceipts.yourAddress')}</Text>
                <Text style={styles.addressText} selectable>
                  {address.address}
                </Text>
                <Pressable onPress={copyAddress} accessibilityRole="button" style={styles.copyButton}>
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={16}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.copyButtonText}>{t(copied ? 'emailReceipts.copied' : 'emailReceipts.copy')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/email-receipts' as never)}
                  accessibilityRole="link"
                  style={styles.settingsLink}
                >
                  <Text style={styles.settingsLinkText}>{t('emailReceipts.title')}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {openId && <EmailReceiptDialog key={openId} id={openId} onClose={closeConfirm} onEdit={handleEdit} />}
      {editPrefill && <CreateDialog kind="expense" initial={editPrefill} onClose={closeCreate} />}
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
    padding: theme.spacing[8],
  },
  centeredText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  toolbarRight: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  segments: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  segment: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  segmentActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
  },
  codeNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  codeNoticeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
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
  bodyStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
  },
  rail: {
    width: RAIL_WIDTH,
    gap: theme.spacing[3],
  },
  railStacked: {
    width: 'auto' as const,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  cardTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  addressText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2.5],
  },
  copyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  copyButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  settingsLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  settingsLinkText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  table: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: theme.spacing[1],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    // Sticks to the top of the ONE page scroll. Opaque and above the rows. Web-only.
    position: 'sticky' as unknown as 'absolute',
    top: 0,
    zIndex: 2,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
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
    paddingHorizontal: theme.spacing[3],
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
  cellMerchant: { flex: 1.2, minWidth: 120, paddingRight: theme.spacing[2] },
  cellSubject: { flex: 2, minWidth: 160, paddingRight: theme.spacing[2] },
  cellFrom: { flex: 1, minWidth: 100, paddingRight: theme.spacing[2] },
  cellDate: { width: 96 },
  cellTotal: { width: 110, alignItems: 'flex-end' as const },
  cellActions: {
    width: 128,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[1],
  },
  merchantText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  cellText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  cellMuted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  reason: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  totalText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  },
  reviewButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  reviewButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  stateBox: {
    minHeight: 200,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
});
