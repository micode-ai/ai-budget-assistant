import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useGroupStore } from '@/stores/groupStore';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { findMember, memberName } from '@/features/groups/groupDisplay';
import {
  checkSettleAmountInput,
  defaultSettleAmount,
  maxSettleAmount,
  settleCounterparts,
} from '@/features/groups/groupMath';
import { SETTLE_METHODS, buildGroupPayLink } from '@/features/groups/groupPay';
import type { SettleMethod } from '@budget/shared-types';
import { GroupButton } from './GroupButton';
import { GroupOfflineBanner } from './GroupOfflineBanner';
import { GroupErrorState } from './GroupErrorState';

interface GroupSettleViewProps {
  groupId: string;
  /**
   * The pair of a suggested row. Both absent = "Record a payment" (ABA-652): the user picks whom
   * they paid (a debtor) or who paid them (a creditor) from everyone they can settle with.
   */
  from?: string;
  to?: string;
  /**
   * Desktop dialog hosting (ABA-646): replaces every `router.back()` below (a dialog is not a
   * route to go back from). The phone passes none, so its behaviour is unchanged.
   */
  onDone?: () => void;
}

/**
 * Record a payment. The pair from the route is re-resolved against the live balances, so a pair
 * that can no longer settle says so instead of recording a stale amount. The amount is editable
 * (ABA-652): it opens at the suggested transfer and may be anything from 0.01 up to
 * `min(what the payer owes, what the receiver is owed)`, the same bound the server enforces, so a
 * payment only ever shrinks both balances. The ledger-version check on the server turns a double
 * tap, or two members settling at once, into "Balances changed, please check again".
 */
export function GroupSettleView({ groupId, from, to, onDone }: GroupSettleViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { detail, loadFailed, reload } = useGroupDetail(groupId);
  const settle = useGroupStore((s) => s.settle);
  const [method, setMethod] = useState<SettleMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Record mode: the counterpart the user picked (null = the first one offered). */
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** What the user typed; null = untouched, so the field shows the current default. */
  const [amountText, setAmountText] = useState<string | null>(null);
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

  const me = detail.myMemberId;
  const recordMode = !from || !to;
  const record = recordMode ? settleCounterparts(detail) : null;
  const picked = record
    ? (record.counterparts.find((c) => c.memberId === pickedId) ?? record.counterparts[0] ?? null)
    : null;
  const fromId = record ? (record.direction === 'pay' ? me : picked?.memberId) : from;
  const toId = record ? (record.direction === 'pay' ? picked?.memberId : me) : to;
  const max = maxSettleAmount(detail.balances, fromId, toId);
  const fallback = defaultSettleAmount(detail, fromId, toId);
  // Only a payment I am part of (the server's acting-member rule).
  const iAmParty = fromId === me || toId === me;

  if (!fromId || !toId || max === null || fallback === null || !iAmParty) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Text style={styles.gone}>{t(recordMode ? 'groups.recordNothing' : 'groups.transferGone')}</Text>
          <GroupButton label={t('common.back')} onPress={finish} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const text = amountText ?? fallback.toFixed(2);
  const check = checkSettleAmountInput(text, max);
  const amount = check.ok ? check.amount : fallback;
  const amountError = check.ok
    ? null
    : check.reason === 'tooMuch'
      ? t('groups.settleAmountTooMuch', { max: formatCurrency(max, detail.currencyCode) })
      : t('groups.settleAmountInvalid');

  const iPay = fromId === me;
  const creditor = findMember(detail, toId);
  const effectiveMethod = method ?? creditor?.paymentMethod ?? null;
  const pay = buildGroupPayLink(
    creditor?.paymentMethod,
    creditor?.paymentHandle,
    amount,
    detail.currencyCode,
  );

  const confirm = async () => {
    setSubmitting(true);
    try {
      if (!check.ok) return;
      const result = await settle(groupId, {
        fromMemberId: fromId,
        toMemberId: toId,
        amount: check.amount,
        ...(effectiveMethod ? { method: effectiveMethod } : {}),
      });
      if (!result.ok && result.reason === 'exceedsBalance') {
        // The bound moved under us; the store reloaded, so stay and show the new one.
        setAmountText(null);
        showAlert(t('groups.settleExceedsBalance'));
        return;
      }
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
        {record && (
          <>
            <Text style={styles.label}>
              {t(record.direction === 'pay' ? 'groups.recordPickPay' : 'groups.recordPickReceive')}
            </Text>
            <View style={styles.chipRow}>
              {record.counterparts.map((c) => {
                const active = c.memberId === picked?.memberId;
                return (
                  <TouchableOpacity
                    key={c.memberId}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setPickedId(c.memberId);
                      setAmountText(null);
                      setMethod(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {memberName(detail, c.memberId)} · {formatCurrency(c.max, detail.currencyCode)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.names}>
            {t('groups.transferRow', {
              from: memberName(detail, fromId),
              to: memberName(detail, toId),
            })}
          </Text>
          <Text style={styles.sectionTitle}>{t('groups.settleAmountLabel')}</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.amountInput, !!amountError && styles.amountInputError]}
              value={text}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel={t('groups.settleAmountLabel')}
              maxLength={10}
              selectTextOnFocus
            />
            <Text style={styles.currency}>{detail.currencyCode}</Text>
          </View>
          {amountError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {amountError}
            </Text>
          ) : (
            <Text style={styles.bounds}>
              {t('groups.settleAmountBounds', { max: formatCurrency(max, detail.currencyCode) })}
            </Text>
          )}
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
          disabled={!check.ok}
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
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  amountInput: {
    ...theme.textStyles.h2,
    flex: 1,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
  },
  amountInputError: {
    borderColor: theme.colors.danger,
  },
  currency: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  bounds: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  error: {
    ...theme.textStyles.caption,
    color: theme.colors.danger,
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
