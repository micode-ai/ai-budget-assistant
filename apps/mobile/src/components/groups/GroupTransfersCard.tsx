import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useStyles, type Theme } from '@/theme';
import { useConnectivity } from '@/hooks/useConnectivity';
import { memberName } from '@/features/groups/groupDisplay';
import type { GroupDetail, GroupTransfer } from '@budget/shared-types';

interface GroupTransfersCardProps {
  detail: GroupDetail;
  canSettle: boolean;
  onSettle: (transfer: GroupTransfer) => void;
}

/** "Who pays whom", with a Settle button on every row that involves me. */
export function GroupTransfersCard({ detail, canSettle, onSettle }: GroupTransfersCardProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { isOffline } = useConnectivity();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.transfersTitle')}</Text>
      {detail.suggestedTransfers.length === 0 ? (
        <Text style={styles.empty}>{t('groups.noTransfers')}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t('groups.transfersHint')}</Text>
          {detail.suggestedTransfers.map((transfer) => {
            const involvesMe =
              transfer.fromMemberId === detail.myMemberId || transfer.toMemberId === detail.myMemberId;
            return (
              <View key={`${transfer.fromMemberId}-${transfer.toMemberId}`} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.names} numberOfLines={2}>
                    {t('groups.transferRow', {
                      from: memberName(detail, transfer.fromMemberId),
                      to: memberName(detail, transfer.toMemberId),
                    })}
                  </Text>
                  <Text style={styles.amount}>{formatCurrency(transfer.amount, detail.currencyCode)}</Text>
                </View>
                {involvesMe && canSettle && (
                  <TouchableOpacity
                    style={[styles.settleButton, isOffline && { opacity: 0.55 }]}
                    onPress={() => onSettle(transfer)}
                    disabled={isOffline}
                    accessibilityState={{ disabled: isOffline }}
                    accessibilityHint={isOffline ? t('groups.offlineBanner') : undefined}
                  >
                    <Text style={styles.settleText}>{t('groups.settleButton')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    gap: theme.spacing[3],
  },
  rowInfo: {
    flex: 1,
  },
  names: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  amount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  settleButton: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primaryLight,
    minWidth: 80,
    alignItems: 'center' as const,
  },
  settleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
