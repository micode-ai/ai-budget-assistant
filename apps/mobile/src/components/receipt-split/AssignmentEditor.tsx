import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { ParticipantChips, type ParticipantChipItem } from '@/components/split/ParticipantChips';
import { validateSplit, MAX_SPLIT_PARTICIPANTS, type SplitParticipantCandidate } from '@/components/split/validateSplit';
import { computeParticipantAssignmentSummaries } from '@/components/split/participantAssignmentSummary';
import { useAddParticipant } from '@/hooks/useAddParticipant';
import { AddPersonRow } from './AddPersonRow';
import { formatCurrency } from '@budget/shared-utils';
import type { CreateSplitDto, ExpenseItem } from '@budget/shared-types';

const OVER_BILL_TOLERANCE = 0.01;

interface AssignmentEditorProps {
  billTotal: number;
  currencyCode: string;
  merchant?: string | null;
  /** Already filtered to non-deleted items by the caller. */
  items: ExpenseItem[];
  mode: 'items' | 'equal';
  hasUnsyncedItems: boolean;
  isEncryptedAccount: boolean;
  recentParticipantNames: string[];
  canEdit: boolean;
  isSubmitting: boolean;
  onSubmit: (dto: CreateSplitDto) => void;
}

/**
 * The receipt-split creation form: assign each receipt line item to a named
 * participant (or, in `'equal'` mode, split the whole bill evenly), then
 * submit. Owns the assignment state itself — `app/expense/split.tsx` only
 * decides WHETHER to render this (no split yet) vs `ParticipantStatusList`
 * (a split already exists) and performs the actual `create()` API call.
 */
export function AssignmentEditor({
  billTotal,
  currencyCode,
  merchant,
  items,
  mode,
  hasUnsyncedItems,
  isEncryptedAccount,
  recentParticipantNames,
  canEdit,
  isSubmitting,
  onSubmit,
}: AssignmentEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [participants, setParticipants] = useState<ParticipantChipItem[]>([]);
  // itemId -> participant.id. An item not present here stays with the payer.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  function addParticipant(name: string) {
    setParticipants((prev) => [...prev, { id: `p-${Date.now()}-${prev.length}`, name }]);
  }

  const {
    isAddingPerson,
    newPersonName,
    setNewPersonName,
    availableRecentNames,
    openAdd,
    handleConfirmAddPerson,
    handleSelectRecentName,
  } = useAddParticipant(
    recentParticipantNames,
    participants.map((p) => p.name),
    addParticipant,
  );

  const priceByItemId = useMemo(() => new Map(items.map((i) => [i.id, i.totalPrice])), [items]);

  // Per-chip item count + CLIENT-SIDE subtotal (guidance only — see
  // ParticipantChips.tsx's docstring). Item mode only: there is no
  // per-person assignment concept in an equal split.
  const assignmentSummaries = useMemo(
    () =>
      mode === 'items'
        ? computeParticipantAssignmentSummaries(
            participants.map((p) => p.id),
            assignments,
            priceByItemId,
          )
        : undefined,
    [mode, participants, assignments, priceByItemId],
  );

  function handleRemoveParticipant(participantId: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [itemId, pid] of Object.entries(next)) {
        if (pid === participantId) delete next[itemId];
      }
      return next;
    });
  }

  function handleSelectItem(itemId: string) {
    if (mode !== 'items' || !canEdit) return;
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  }

  function handleSelectParticipant(participantId: string) {
    if (!canEdit || mode !== 'items' || !selectedItemId) return;
    setAssignments((prev) => ({ ...prev, [selectedItemId]: participantId }));
    setSelectedItemId(null);
  }

  function participantNameFor(itemId: string): string | null {
    const pid = assignments[itemId];
    if (!pid) return null;
    return participants.find((p) => p.id === pid)?.name ?? null;
  }

  // Client-side aggregate for the overBill guard ONLY — never rendered as a
  // participant's or the payer's authoritative share. See validateSplit.ts.
  const validationCandidates: SplitParticipantCandidate[] = useMemo(() => {
    if (mode === 'equal') {
      const perHead = participants.length > 0 ? billTotal / (participants.length + 1) : 0;
      return participants.map((p) => ({ name: p.name, shareAmount: perHead }));
    }
    return participants.map((p) => {
      const shareAmount = Object.entries(assignments)
        .filter(([, pid]) => pid === p.id)
        .reduce((sum, [itemId]) => sum + (priceByItemId.get(itemId) ?? 0), 0);
      return { name: p.name, shareAmount };
    });
  }, [participants, assignments, mode, billTotal, priceByItemId]);

  const isValid = validateSplit(validationCandidates, billTotal);
  const showTooManyHint = participants.length > MAX_SPLIT_PARTICIPANTS;
  const showOverBillHint =
    validationCandidates.reduce((sum, p) => sum + p.shareAmount, 0) > billTotal + OVER_BILL_TOLERANCE;
  // A named friend with nothing assigned resolves to a 0 share, which the server
  // rejects outright — that used to only surface as a single generic bottom-of-screen
  // hint (`assignEveryone`, still in i18n but no longer rendered here). Each
  // participant chip now shows its own "0 items" warning in-place (see
  // ParticipantChips.tsx), which is more actionable — it names WHO still needs
  // something assigned — so the generic hint would just be noise underneath it.

  function handleCreatePress() {
    if (!canEdit || !isValid || isEncryptedAccount || isSubmitting) return;
    const dto: CreateSplitDto = {
      mode,
      participants: participants.map((p) => ({
        name: p.name,
        itemIds:
          mode === 'items'
            ? Object.entries(assignments)
                .filter(([, pid]) => pid === p.id)
                .map(([itemId]) => itemId)
            : undefined,
      })),
    };
    onSubmit(dto);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {isEncryptedAccount && (
          <View style={styles.warningBox}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.warningText}>{t('receiptSplit.encrypted')}</Text>
          </View>
        )}

        <Text style={styles.billText}>{formatCurrency(billTotal, currencyCode)}</Text>
        {merchant ? <Text style={styles.merchantText}>{merchant}</Text> : null}

        {mode === 'equal' ? (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
            <View style={styles.hintTextWrap}>
              <Text style={styles.sectionTitle}>{t('receiptSplit.equalMode')}</Text>
              {/* hasUnsyncedItems: real line items exist locally but haven't round-tripped
                  through the server yet, so their ids aren't safe to submit — reusing
                  `settings.syncing` ("Syncing...") rather than the "no line items" copy,
                  which would be misleading here. No new i18n key. */}
              <Text style={styles.hintText}>
                {hasUnsyncedItems ? t('settings.syncing') : t('receiptSplit.equalHint')}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t('receiptSplit.assignHint')}</Text>
            <View style={styles.itemsCard}>
              {items.map((item, index) => {
                const assignedName = participantNameFor(item.id);
                const selected = selectedItemId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.itemRow,
                      index < items.length - 1 && styles.itemDivider,
                      selected && styles.itemRowSelected,
                    ]}
                    onPress={() => handleSelectItem(item.id)}
                    activeOpacity={canEdit ? 0.7 : 1}
                    disabled={!canEdit}
                  >
                    {/* The thing that IS actually selected is THIS item, not any person
                        chip — a radio-style icon makes that state unambiguous and gives
                        it a visual language distinct from the chips' dashed tap-target
                        outline below (see ParticipantChips.tsx's docstring). */}
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={16}
                      color={selected ? theme.colors.primary : theme.colors.textTertiary}
                    />
                    <Text style={styles.itemDescription} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <View style={styles.itemAssignBadge}>
                      {assignedName ? (
                        <Text style={styles.itemAssignedText} numberOfLines={1}>
                          {assignedName}
                        </Text>
                      ) : (
                        <Ionicons name="person-add-outline" size={14} color={theme.colors.textTertiary} />
                      )}
                    </View>
                    <Text style={styles.itemPrice}>{formatCurrency(item.totalPrice, currencyCode)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('receiptSplit.title')}</Text>

        {/* Only rendered while an item is genuinely awaiting a person — this
            instruction, not a filled chip look, is what tells the payer what
            to do next (see ParticipantChips.tsx's docstring for the full
            rationale). */}
        {mode === 'items' && !!selectedItemId && (
          <View style={styles.tapHintRow}>
            <Ionicons name="hand-left-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.tapHintText}>{t('receiptSplit.tapPersonHint')}</Text>
          </View>
        )}

        <ParticipantChips
          participants={participants}
          awaitingAssignment={mode === 'items' && !!selectedItemId}
          assignmentSummaries={assignmentSummaries}
          currencyCode={currencyCode}
          onPress={handleSelectParticipant}
          onRemove={handleRemoveParticipant}
          onAddPress={openAdd}
          canEdit={canEdit}
        />

        {isAddingPerson && canEdit && (
          <AddPersonRow
            value={newPersonName}
            onChangeText={setNewPersonName}
            onConfirm={handleConfirmAddPerson}
            recentNames={availableRecentNames}
            onSelectRecent={handleSelectRecentName}
          />
        )}

        {showTooManyHint && <Text style={styles.errorHint}>{t('receiptSplit.tooMany')}</Text>}
        {showOverBillHint && <Text style={styles.errorHint}>{t('receiptSplit.overBill')}</Text>}
      </KeyboardAwareScreen>

      {canEdit && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!isValid || isEncryptedAccount || isSubmitting) && styles.confirmBtnDisabled,
            ]}
            onPress={handleCreatePress}
            disabled={!isValid || isEncryptedAccount || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.confirmBtnText}>{t('receiptSplit.createSplit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  billText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  merchantText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing[2],
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  warningBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    flex: 1,
  },
  hintBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  hintTextWrap: {
    flex: 1,
  },
  hintText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  itemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden' as const,
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  itemRowSelected: {
    backgroundColor: theme.colors.primaryLight,
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
  itemAssignBadge: {
    minWidth: 60,
    alignItems: 'flex-end' as const,
  },
  itemAssignedText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontFamily: theme.fonts.semiBold,
  },
  itemPrice: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    minWidth: 70,
    textAlign: 'right' as const,
  },
  tapHintRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  tapHintText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  errorHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
  },
  footer: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  confirmBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
