import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { formatCurrency } from '@budget/shared-utils';
import type { SplitStateResponse, SplitParticipantState, SplitParticipantStatus } from '@budget/shared-types';

// Compile-time checked: TS requires every SplitParticipantStatus member to
// have an entry here, so a future 5th status fails the build instead of
// silently rendering as a raw key string (the bug this replaced — see the
// `as any` cast that used to live here before this was its own component).
const STATUS_LABEL_KEYS: Record<SplitParticipantStatus, string> = {
  sent: 'receiptSplit.statusSent',
  opened: 'receiptSplit.statusOpened',
  claimed: 'receiptSplit.statusClaimed',
  settled: 'receiptSplit.statusSettled',
};

interface ParticipantStatusListProps {
  split: SplitStateResponse;
  canEdit: boolean;
  confirmingId: string | null;
  isCancelling: boolean;
  onSend: (participant: SplitParticipantState) => void;
  onConfirm: (participant: SplitParticipantState) => void;
  onCopyAll: () => void;
  onCancelPress: () => void;
  /** Opens the group QR modal (ABA — QR-code bill split) — undefined when
   * `split.groupUrl` is null (a split created before this field existed),
   * in which case the button below is not rendered at all. */
  onShowQr?: () => void;
}

/**
 * The status view a receipt-split screen (`app/expense/split.tsx`) becomes
 * once a split exists for the expense: one row per participant with a
 * status badge, a per-row Send (native share sheet) action, a Copy-all-links
 * action, and a Confirm-received action that appears only once a guest has
 * marked their share as claimed. Cancel lives here too.
 *
 * `split.ownShare` and every participant's `amount` are rendered exactly as
 * the server returned them — this component never re-derives a share.
 */
export function ParticipantStatusList({
  split,
  canEdit,
  confirmingId,
  isCancelling,
  onSend,
  onConfirm,
  onCopyAll,
  onCancelPress,
  onShowQr,
}: ParticipantStatusListProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // Status→color, not status→label (that's STATUS_LABEL_KEYS above) — colors
  // must read from the live theme (accent/light/dark), so this can't be a
  // module-scope constant the way the label-key map is.
  const statusColors: Record<SplitParticipantStatus, string> = {
    sent: theme.colors.textTertiary,
    opened: theme.colors.info,
    claimed: theme.colors.warning,
    settled: theme.colors.success,
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>{t('receiptSplit.yourShare')}</Text>
        <Text style={styles.amountText}>{formatCurrency(split.ownShare, split.currencyCode)}</Text>

        <View style={styles.itemsCard}>
          {split.participants.map((p, index) => (
            <View
              key={p.id}
              style={[styles.statusRow, index < split.participants.length - 1 && styles.itemDivider]}
            >
              <View style={styles.statusRowHeader}>
                <Text style={styles.itemDescription} numberOfLines={1}>
                  {p.name}
                </Text>
                {/* statusColors/STATUS_LABEL_KEYS are Record<SplitParticipantStatus, …> —
                    a compile error here, not a silent raw-key render, if a status is ever added. */}
                <Text style={[styles.statusBadgeText, { color: statusColors[p.status] }]}>
                  {t(STATUS_LABEL_KEYS[p.status])}
                </Text>
                <Text style={styles.itemPrice}>{formatCurrency(p.amount, p.currencyCode)}</Text>
              </View>

              <View style={styles.statusRowActions}>
                <TouchableOpacity
                  style={styles.statusActionBtn}
                  onPress={() => onSend(p)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.statusActionText} numberOfLines={1}>
                    {t('common.share')}
                  </Text>
                </TouchableOpacity>

                {/* A `claimed` guest is only saying they paid — this button is the
                    payer's own verification step that turns it into `settled`.
                    Never shown for `sent`/`opened` (nothing to nag about) or
                    `settled` (already done), and never rendered for a viewer. */}
                {canEdit && p.status === 'claimed' && (
                  <TouchableOpacity
                    style={[styles.statusActionBtn, styles.confirmActionBtn]}
                    onPress={() => onConfirm(p)}
                    activeOpacity={0.7}
                    disabled={confirmingId === p.id}
                  >
                    {confirmingId === p.id ? (
                      <ActivityIndicator size="small" color={theme.colors.success} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.success} />
                        <Text style={[styles.statusActionText, styles.confirmActionText]} numberOfLines={1}>
                          {t('receiptSplit.confirmPaid')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* In-person action — everyone at the table scans one code instead of
            the payer delivering N distinct links one at a time (ABA —
            QR-code bill split). Hidden for a split created before
            `groupUrl` existed (see the prop doc above); "Copy all links"
            below stays for the async/remote case either way. */}
        {onShowQr && (
          <TouchableOpacity style={styles.showQrBtn} onPress={onShowQr} activeOpacity={0.7}>
            <Ionicons name="qr-code-outline" size={18} color={theme.colors.onSemantic} />
            <Text style={styles.showQrText}>{t('receiptSplit.showQr')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.copyAllBtn} onPress={onCopyAll} activeOpacity={0.7}>
          <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.copyAllText}>{t('receiptSplit.copyAll')}</Text>
        </TouchableOpacity>

        {canEdit && (
          <TouchableOpacity
            style={styles.cancelSplitBtn}
            onPress={onCancelPress}
            activeOpacity={0.7}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Text style={styles.cancelSplitText}>{t('receiptSplit.cancelSplit')}</Text>
            )}
          </TouchableOpacity>
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  amountText: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
  },
  itemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden' as const,
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  itemDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  itemPrice: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    minWidth: 70,
    textAlign: 'right' as const,
  },
  statusRow: {
    flexDirection: 'column' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  statusRowHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  statusBadgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },
  statusRowActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  statusActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  confirmActionBtn: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successLight,
  },
  confirmActionText: {
    color: theme.colors.success,
  },
  showQrBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  showQrText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.onSemantic,
    fontFamily: theme.fonts.semiBold,
  },
  copyAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copyAllText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  cancelSplitBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
  cancelSplitText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.danger,
  },
});
