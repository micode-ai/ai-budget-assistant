import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface ParticipantChipItem {
  /** Client-local id (temp key) — never sent to the server as-is; the create
   * DTO only carries `name` + resolved `itemIds` per participant. */
  id: string;
  name: string;
}

interface Props {
  participants: ParticipantChipItem[];
  /** True while an item is selected awaiting a person to assign it to — gives
   * every chip a highlighted border so it reads as "tap someone now". */
  awaitingAssignment?: boolean;
  /** Tapping a chip assigns the currently-selected line item to this person
   * (no-op when nothing is selected — the screen decides that). */
  onPress: (participantId: string) => void;
  onRemove: (participantId: string) => void;
  onAddPress: () => void;
  canEdit: boolean;
}

/**
 * The row of person chips on the receipt-split screen: one chip per added
 * participant plus a trailing "+ Add person" chip. Purely presentational —
 * assignment/removal/name-entry state all live in the parent screen
 * (`app/expense/split.tsx`), matching how `TripExpenseSplitPicker` stays
 * presentational-only and lets its parent own persistence.
 */
export function ParticipantChips({
  participants,
  awaitingAssignment,
  onPress,
  onRemove,
  onAddPress,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.row}>
      {participants.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={[styles.chip, awaitingAssignment && styles.chipAwaiting]}
          onPress={canEdit ? () => onPress(p.id) : undefined}
          activeOpacity={canEdit ? 0.7 : 1}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {p.name}
          </Text>
          {canEdit && (
            <TouchableOpacity
              onPress={() => onRemove(p.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.removeBtn}
            >
              <Ionicons name="close" size={12} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}
      {canEdit && (
        <TouchableOpacity style={styles.addChip} onPress={onAddPress} activeOpacity={0.7}>
          <Ionicons name="add" size={14} color={theme.colors.primary} />
          <Text style={styles.addChipText}>{t('receiptSplit.addPerson')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipAwaiting: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  removeBtn: {
    marginLeft: 2,
  },
  addChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
  },
  addChipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
});
