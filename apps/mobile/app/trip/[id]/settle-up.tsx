import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import type { SuggestedTransfer, SettleUpTransaction } from '@budget/shared-types';

// Key used to correlate a `suggestedTransfers` entry with the locally-tracked
// transactionId returned by payDebt(). Suggested transfers are computed
// on-the-fly from balances (not persisted rows), so this is the only stable
// identity they have.
const transferKey = (t: Pick<SuggestedTransfer, 'fromUserId' | 'toUserId'>) =>
  `${t.fromUserId}-${t.toUserId}`;

// Finds the real server-side pending SettleUpTransaction backing a suggestedTransfers
// entry for the given receiver. Matches on (fromUserId, toUserId, status:'pending')
// first; if more than one pending transaction exists between the same two people
// (unusual but possible — e.g. two separate partial payments queued), disambiguate
// by amount using the same 0.01 rounding tolerance the API uses when matching a
// payment to a suggested transfer (see createPayment in trip-settle-up.service.ts).
// Falls back to the first match if none matches on amount.
const findPendingTransaction = (
  transfer: Pick<SuggestedTransfer, 'fromUserId' | 'toUserId' | 'amount'>,
  pendingTransactions: SettleUpTransaction[],
  receiverUserId: string | undefined,
): SettleUpTransaction | undefined => {
  if (!receiverUserId) return undefined;
  const candidates = pendingTransactions.filter(
    (txn) =>
      txn.status === 'pending' &&
      txn.toUserId === receiverUserId &&
      txn.fromUserId === transfer.fromUserId,
  );
  if (candidates.length <= 1) return candidates[0];
  return candidates.find((txn) => Math.abs(txn.amount - transfer.amount) < 0.01) ?? candidates[0];
};

export default function SettleUpScreen() {
  const { id: accountId } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    balances,
    suggestedTransfers,
    pendingTransactions,
    isLoading,
    loadSettleUp,
    payDebt,
    confirmPayment,
  } = useTripStore();
  const currentUser = useAuthStore((s) => s.user);
  const rates = useExchangeRateStore((s) => s.rates);
  const userCurrency = currentUser?.currencyCode || 'USD';
  // suggestedTransfers/balances amounts are denominated in the trip
  // account's own currency (see SuggestedTransfer/SettleUpBalance comments in
  // shared-types), which may differ from the viewer's display currency.
  const tripCurrency =
    useAccountStore((s) => s.accounts.find((a) => a.id === accountId)?.currencyCode) ||
    userCurrency;

  // transferTxnIds is now PAYER-ONLY optimistic UX: right after a successful payDebt()
  // call it lets the payer's own device immediately show "awaiting confirmation"
  // without waiting for a refetch. It is NOT used to gate or drive the receiver's
  // confirm flow anymore — the receiver's device (which never calls payDebt itself)
  // has no way to populate this local map, so the real source of truth for "is there
  // something to confirm, and what is its id" is the server-fetched
  // tripStore.pendingTransactions (see findPendingTransaction above), which is
  // populated by loadSettleUp() on ANY device, regardless of who initiated the payment.
  const [transferTxnIds, setTransferTxnIds] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (accountId) loadSettleUp(accountId);
  }, [accountId, loadSettleUp]);

  // Refresh when the screen regains focus — e.g. the payer switches to a
  // payment app via the paymentLink and comes back.
  useFocusEffect(
    useCallback(() => {
      if (accountId) loadSettleUp(accountId);
    }, [accountId]),
  );

  const onRefresh = useCallback(async () => {
    if (!accountId) return;
    setRefreshing(true);
    try {
      await loadSettleUp(accountId);
    } finally {
      setRefreshing(false);
    }
  }, [accountId, loadSettleUp]);

  const handlePay = useCallback(
    async (transfer: SuggestedTransfer) => {
      if (!accountId) return;
      const key = transferKey(transfer);
      setBusyKey(key);
      try {
        const response = await payDebt(
          accountId,
          transfer.fromUserId,
          transfer.toUserId,
          transfer.amount,
        );
        setTransferTxnIds((prev) => ({ ...prev, [key]: response.transactionId }));
        if (response.paymentLink) {
          await Linking.openURL(response.paymentLink);
        } else if (response.manualInstructions) {
          showAlert(
            t('trip.payVia'),
            [t('trip.manualBlikInstructions'), response.paymentHandle].filter(Boolean).join(' '),
          );
        } else {
          showAlert(t('trip.markAsPaid'), t('trip.markAsPaidBody'));
        }
      } catch (e) {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      } finally {
        setBusyKey(null);
      }
    },
    [accountId, payDebt, t],
  );

  const handleConfirm = useCallback(
    async (transfer: SuggestedTransfer) => {
      if (!accountId) return;
      const key = transferKey(transfer);
      const pendingTxn = findPendingTransaction(transfer, pendingTransactions, currentUser?.id);
      // Defensive: the confirm button only renders when a matching pending
      // transaction was found (see renderItem below), so this should be
      // unreachable. Never call confirmPayment with a missing/placeholder id.
      if (!pendingTxn) return;

      setBusyKey(key);
      try {
        await confirmPayment(accountId, pendingTxn.id);
        setTransferTxnIds((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } catch (e) {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      } finally {
        setBusyKey(null);
      }
    },
    [accountId, confirmPayment, pendingTransactions, currentUser?.id, t],
  );

  if (isLoading && balances.length === 0 && suggestedTransfers.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoading && suggestedTransfers.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle-outline" size={64} color={theme.colors.success} />
          <Text style={styles.emptyTitle}>{t('trip.allSettled')}</Text>
          <Text style={styles.emptySubtitle}>{t('trip.allSettledHint')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ListHeaderComponent = () =>
    balances.length > 0 ? (
      <View style={styles.balancesCard}>
        <Text style={styles.sectionTitle}>{t('trip.balances')}</Text>
        {balances.map((b) => {
          const converted = convertAmount(b.netAmount, tripCurrency, userCurrency, rates);
          const isPositive = b.netAmount >= 0;
          return (
            <View key={b.userId} style={styles.balanceRow}>
              <Text style={styles.balanceName} numberOfLines={1}>
                {b.userName}
              </Text>
              <Text
                style={[
                  styles.balanceAmount,
                  { color: isPositive ? theme.colors.success : theme.colors.danger },
                ]}
              >
                {isPositive ? '+' : ''}
                {formatCurrency(converted, userCurrency)}
              </Text>
            </View>
          );
        })}
        <Text style={[styles.sectionTitle, styles.transfersTitle]}>
          {t('trip.suggestedTransfers')}
        </Text>
      </View>
    ) : null;

  const renderItem = ({ item }: { item: SuggestedTransfer }) => {
    const key = transferKey(item);
    const fromName = balances.find((b) => b.userId === item.fromUserId)?.userName ?? '';
    const toName = balances.find((b) => b.userId === item.toUserId)?.userName ?? '';
    const displayAmount = convertAmount(item.amount, tripCurrency, userCurrency, rates);
    const isMeOwing = item.fromUserId === currentUser?.id;
    const isMeReceiving = item.toUserId === currentUser?.id;
    // Payer-only optimistic flag (see transferTxnIds comment above) — used solely to
    // show "awaiting confirmation" on the payer's own device right after payDebt().
    const hasTrackedTxn = Boolean(transferTxnIds[key]);
    // Receiver's confirm availability is driven by real server data so it works on
    // the receiver's own device even though it never called payDebt() itself.
    const canConfirm = Boolean(
      findPendingTransaction(item, pendingTransactions, currentUser?.id),
    );
    const isBusy = busyKey === key;

    return (
      <View style={styles.row}>
        <View style={styles.rowInfo}>
          <Text style={styles.rowNames} numberOfLines={1}>
            {fromName} → {toName}
          </Text>
          <Text style={styles.rowAmount}>{formatCurrency(displayAmount, userCurrency)}</Text>
        </View>

        {isMeOwing && !hasTrackedTxn && (
          <TouchableOpacity
            style={styles.actionButton}
            disabled={isBusy}
            onPress={() => handlePay(item)}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.actionButtonText}>{t('trip.payVia')}</Text>
            )}
          </TouchableOpacity>
        )}
        {isMeOwing && hasTrackedTxn && (
          <Text style={styles.awaitingText}>{t('trip.awaitingConfirmation')}</Text>
        )}

        {/* Receiver can confirm once a matching pending SettleUpTransaction exists in
            tripStore.pendingTransactions (fetched from the server by loadSettleUp on
            ANY device) — not gated on the local transferTxnIds map, so this works
            correctly on the receiver's own device even when it never called payDebt(). */}
        {isMeReceiving && canConfirm && (
          <TouchableOpacity
            style={styles.actionButton}
            disabled={isBusy}
            onPress={() => handleConfirm(item)}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.actionButtonText}>{t('trip.confirmReceived')}</Text>
            )}
          </TouchableOpacity>
        )}
        {isMeReceiving && !canConfirm && (
          <Text style={styles.awaitingText}>{t('trip.awaitingPayment')}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={suggestedTransfers}
        keyExtractor={transferKey}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />
        }
      />
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
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  listContent: {
    padding: theme.spacing[4],
  },
  balancesCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  transfersTitle: {
    marginTop: theme.spacing[3],
    marginBottom: 0,
  },
  balanceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
  },
  balanceName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  balanceAmount: {
    ...theme.textStyles.bodySmMedium,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  rowInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  rowNames: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  rowAmount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  actionButton: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
    minWidth: 90,
    alignItems: 'center' as const,
  },
  actionButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  awaitingText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    maxWidth: 100,
    textAlign: 'right' as const,
  },
  separator: {
    height: theme.spacing[3],
  },
});
