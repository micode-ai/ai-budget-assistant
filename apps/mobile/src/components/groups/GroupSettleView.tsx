import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useGroupStore } from '@/stores/groupStore';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { findCurrentTransfer, findMember, memberName } from '@/features/groups/groupDisplay';
import { SETTLE_METHODS, buildGroupPayLink } from '@/features/groups/groupPay';
import type { SettleMethod } from '@budget/shared-types';
import { GroupButton } from './GroupButton';
import { GroupOfflineBanner } from './GroupOfflineBanner';
import { GroupErrorState } from './GroupErrorState';

interface GroupSettleViewProps {
  groupId: string;
  from?: string;
  to?: string;
  /**
   * Desktop dialog hosting (ABA-646): replaces every `router.back()` below (a dialog is not a
   * route to go back from). The phone passes none, so its behaviour is unchanged.
   */
  onDone?: () => void;
}

/**
 * Confirm one suggested payment. The pair from the route is re-resolved against the live detail,
 * so a payment that stopped being suggested says so instead of recording a stale amount. The
 * ledger-version check on the server turns a double tap, or two members settling the same
 * transfer, into "Balances changed, please check again".
 */
export function GroupSettleView({ groupId, from, to, onDone }: GroupSettleViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { detail, loadFailed, reload } = useGroupDetail(groupId);
  const settle = useGroupStore((s) => s.settle);
  const [method, setMethod] = useState<SettleMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Once recorded, the transfer drops out of the live detail; keep the screen quiet until it closes.
  const [done, setDone] = useState(false);
  const finish = () => (onDone ? onDone() : router.back());

  if (!detail || done) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {loadFailed && !done ? (
          <GroupErrorState onRetry={reload} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const transfer = findCurrentTransfer(detail, from, to);
  if (!transfer) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Text style={styles.gone}>{t('groups.transferGone')}</Text>
          <GroupButton label={t('common.back')} onPress={finish} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const iPay = transfer.fromMemberId === detail.myMemberId;
  const creditor = findMember(detail, transfer.toMemberId);
  const effectiveMethod = method ?? creditor?.paymentMethod ?? null;
  const pay = buildGroupPayLink(
    creditor?.paymentMethod,
    creditor?.paymentHandle,
    transfer.amount,
    detail.currencyCode,
  );

  const confirm = async () => {
    setSubmitting(true);
    try {
      const result = await settle(groupId, {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amount: transfer.amount,
        ...(effectiveMethod ? { method: effectiveMethod } : {}),
      });
      setDone(true);
      if (!result.ok) {
        showAlert(t('groups.ledgerChanged'));
        finish();
        return;
      }
      showAlert(t('groups.settleDone'));
      finish();
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <GroupOfflineBanner />
        <View style={styles.card}>
          <Text style={styles.names}>
            {t('groups.transferRow', {
              from: memberName(detail, transfer.fromMemberId),
              to: memberName(detail, transfer.toMemberId),
            })}
          </Text>
          <Text style={styles.amount}>{formatCurrency(transfer.amount, detail.currencyCode)}</Text>
        </View>

        {iPay && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {creditor ? creditor.displayName : ''}
            </Text>
            {pay.link ? (
              <GroupButton
                label={t('groups.payWith', { method: t(`groups.method_${creditor?.paymentMethod}`) })}
                onPress={() => void Linking.openURL(pay.link as string)}
                variant="secondary"
              />
            ) : pay.instruction ? (
              <Text style={styles.instruction}>
                {t(`groups.payInstruction_${pay.instruction}`, { handle: creditor?.paymentHandle })}
              </Text>
            ) : (
              <Text style={styles.instruction}>
                {t('groups.noPaymentInfo', { name: creditor?.displayName ?? '' })}
              </Text>
            )}
          </View>
        )}

        <Text style={styles.label}>{t('groups.methodLabel')}</Text>
        <View style={styles.chipRow}>
          {SETTLE_METHODS.map((m) => {
            const active = effectiveMethod === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setMethod(active && method === m ? null : m)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`groups.method_${m}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.note}>{t('groups.settleNote')}</Text>

        <GroupButton
          label={iPay ? t('groups.settleConfirmPaid') : t('groups.settleConfirmReceived')}
          onPress={confirm}
          loading={submitting}
          write
          style={styles.confirm}
        />
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
    padding: theme.spacing[6],
    gap: theme.spacing[4],
  },
  gone: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  names: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  amount: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  instruction: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  note: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  confirm: {
    marginTop: theme.spacing[2],
  },
});
