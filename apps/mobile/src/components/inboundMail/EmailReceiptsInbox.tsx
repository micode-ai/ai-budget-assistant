import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Currency, InboundReceiptListItem } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { getIntlLocale } from '@/i18n';
import { useAccountStore } from '@/stores/accountStore';
import { useInboundReceiptStore } from '@/stores/inboundReceiptStore';
import { canRetry, handledReasonKey, visibleReceipts } from '@/features/inboundMail/inboundMail';

type Segment = 'pending' | 'handled';

/**
 * The e-mail receipts inbox (ABA-644): `pending` items to confirm and a `handled`
 * segment explaining what happened to the rest, with Retry where it applies.
 * Online-only by design - the items are server-born - so the empty and error states
 * say so rather than showing a blank list.
 */
export function EmailReceiptsInbox() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const availability = useInboundReceiptStore((s) => s.availability);
  const pending = useInboundReceiptStore((s) => s.pending);
  const handled = useInboundReceiptStore((s) => s.handled);
  const locallySaved = useInboundReceiptStore((s) => s.locallySaved);
  const isLoading = useInboundReceiptStore((s) => s.isLoading);
  const error = useInboundReceiptStore((s) => s.error);
  const waitingCode = useInboundReceiptStore((s) => s.address?.pendingVerification?.code);

  useFocusEffect(
    useCallback(() => {
      const store = useInboundReceiptStore.getState();
      void store.loadInbox();
      void store.loadAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentAccountId]),
  );

  const items = visibleReceipts(segment === 'pending' ? pending : handled, segment, locallySaved);

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

  const renderItem = ({ item }: { item: InboundReceiptListItem }) => {
    const isPending = segment === 'pending';
    const openable = isPending && canEdit;
    const busy = busyId === item.id;
    const total =
      item.total != null && item.currencyCode
        ? formatCurrency(item.total, item.currencyCode as Currency)
        : null;
    const date = item.date ? new Date(`${item.date}T12:00:00`).toLocaleDateString(getIntlLocale()) : null;

    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowMain}
          disabled={!openable}
          activeOpacity={openable ? 0.7 : 1}
          onPress={() => router.push({ pathname: '/inbox/email-receipt', params: { id: item.id } } as any)}
        >
          <View style={styles.rowTop}>
            <Text style={styles.merchant} numberOfLines={1}>
              {item.merchant ?? item.fromDomain}
            </Text>
            {total && <Text style={styles.total}>{total}</Text>}
          </View>
          <Text style={styles.subject} numberOfLines={1}>
            {item.subject ?? t('emailReceipts.noSubject')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t('emailReceipts.from', { domain: item.fromDomain })}
            {date ? `  ·  ${date}` : ''}
          </Text>
          {!isPending && (
            <Text style={styles.reason}>{t(`emailReceipts.${handledReasonKey(item)}`)}</Text>
          )}
        </TouchableOpacity>

        {canEdit && (
          <View style={styles.actions}>
            {busy ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                {!isPending && canRetry(item) && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => void guarded(item, () => useInboundReceiptStore.getState().retry(item.id))}
                    accessibilityLabel={t('emailReceipts.retry')}
                  >
                    <Ionicons name="refresh-outline" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => confirmDismiss(item)}
                  accessibilityLabel={t('emailReceipts.dismiss')}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  const empty = () => {
    if (isLoading) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="mail-outline" size={40} color={theme.colors.textTertiary} />
        <Text style={styles.emptyText}>
          {error
            ? t('emailReceipts.loadFailed')
            : t(segment === 'pending' ? 'emailReceipts.emptyPending' : 'emailReceipts.emptyHandled')}
        </Text>
        <Text style={styles.emptyHint}>{t('emailReceipts.offlineNote')}</Text>
      </View>
    );
  };

  if (availability === 'unavailable') {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('emailReceipts.unavailable')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.segments}>
        {(['pending', 'handled'] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.segment, segment === value && styles.segmentActive]}
            onPress={() => setSegment(value)}
          >
            <Text style={[styles.segmentText, segment === value && styles.segmentTextActive]}>
              {t(value === 'pending' ? 'emailReceipts.segmentPending' : 'emailReceipts.segmentHandled')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {waitingCode && (
        <TouchableOpacity
          style={styles.codeNotice}
          onPress={() => router.push('/settings/email-receipts' as any)}
        >
          <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.codeNoticeText}>{t('emailReceipts.verificationWaiting')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        contentContainerStyle={{ padding: theme.spacing[4], paddingBottom: theme.spacing[10] + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && items.length > 0}
            onRefresh={() => void useInboundReceiptStore.getState().loadInbox()}
            tintColor={theme.colors.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  segments: {
    flexDirection: 'row' as const,
    margin: theme.spacing[4],
    marginBottom: 0,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
  },
  segment: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  segmentActive: { backgroundColor: theme.colors.primary },
  segmentText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  segmentTextActive: { color: theme.colors.textInverse },
  codeNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
  },
  codeNoticeText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  rowMain: { flex: 1, padding: theme.spacing[4] },
  rowTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: theme.spacing[2] },
  merchant: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary, flex: 1 },
  total: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  subject: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
  meta: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },
  reason: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[2] },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingRight: theme.spacing[2] },
  actionButton: { padding: theme.spacing[2] },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[8],
    gap: theme.spacing[3],
  },
  emptyText: { ...theme.textStyles.bodyLarge, color: theme.colors.textSecondary, textAlign: 'center' as const },
  emptyHint: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, textAlign: 'center' as const },
});
