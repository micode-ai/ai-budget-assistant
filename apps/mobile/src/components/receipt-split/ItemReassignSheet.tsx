import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface ItemReassignParticipant {
  id: string;
  name: string;
}

interface ItemReassignSheetProps {
  /** `null` when nothing is being edited — the sheet renders nothing at all
   * (not merely `visible={false}`), so its local toggle state never has to
   * be reasoned about while closed. */
  itemId: string | null;
  itemDescription: string;
  itemPrice: number;
  currencyCode: string;
  /** The split's own EXISTING participants — this sheet never offers to add
   * or remove one (ABA-546 scope: reassign this one line among the people
   * already on the split, nothing else). */
  participants: ItemReassignParticipant[];
  /** Who currently claims `itemId`, seeding the toggle state on open. */
  initialClaimantIds: string[];
  isSaving: boolean;
  onSave: (participantIds: string[]) => void;
  onClose: () => void;
}

/**
 * Fixes ONE disputed split line in place (ABA-546) instead of the
 * cancel-and-recreate `flagFixHint` used to be the only option — see
 * docs/contracts/receipt-split-in-place-reassignment.md. Deliberately NOT a
 * reopened `AssignmentEditor`: this sheet only toggles claims on the split's
 * existing participants for the ONE line it was opened for, nothing else.
 *
 * Same visual family as `GroupQrModal.tsx` — backdrop + slide-up card,
 * handle bar, bottom padding cleared for the system nav bar (ABA-483).
 */
export function ItemReassignSheet({
  itemId,
  itemDescription,
  itemPrice,
  currencyCode,
  participants,
  initialClaimantIds,
  isSaving,
  onSave,
  onClose,
}: ItemReassignSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<string[]>(initialClaimantIds);

  // Re-seed the toggle state whenever a DIFFERENT line is opened for editing
  // — without this, reopening the sheet on a second flagged line would carry
  // over the first line's selection.
  useEffect(() => {
    setSelected(initialClaimantIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function toggle(participantId: string) {
    if (isSaving) return;
    setSelected((prev) =>
      prev.includes(participantId) ? prev.filter((id) => id !== participantId) : [...prev, participantId],
    );
  }

  const visible = itemId !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={isSaving ? undefined : onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: theme.spacing[6] + insets.bottom }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{t('receiptSplit.editAssignmentTitle')}</Text>

          <View style={styles.itemRow}>
            <Text style={styles.itemDescription} numberOfLines={2}>
              {itemDescription}
            </Text>
            <Text style={styles.itemPrice}>{formatCurrency(itemPrice, currencyCode)}</Text>
          </View>

          <View style={styles.chipsRow}>
            {participants.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, checked && styles.chipChecked]}
                  onPress={() => toggle(p.id)}
                  activeOpacity={0.7}
                  disabled={isSaving}
                >
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={checked ? theme.colors.primary : theme.colors.textTertiary}
                  />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={() => onSave(selected)}
            activeOpacity={0.8}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.saveBtnText}>{t('receiptSplit.editAssignmentSave')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSaving}>
            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  itemDescription: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  itemPrice: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  chipsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  saveBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  cancelBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
  cancelBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
});
