import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ParticipantAssignmentSummary } from './participantAssignmentSummary';

export interface ParticipantChipItem {
  /** Client-local id (temp key) — never sent to the server as-is; the create
   * DTO only carries `name` + resolved `itemIds` per participant. */
  id: string;
  name: string;
}

interface Props {
  participants: ParticipantChipItem[];
  /** True while an item is selected awaiting a person to assign it to. Chips
   * render with a dashed "tap target" outline (NOT a filled/highlighted
   * look) — see the docstring below for why a filled state was actively the
   * wrong signal here. */
  awaitingAssignment?: boolean;
  /** Per-participant item count + CLIENT-SIDE subtotal, item mode only
   * (`undefined` in equal mode, where there is no assignment concept).
   * Rendered with a "~" prefix and muted/warning styling — a guidance
   * aggregate, NEVER the authoritative amount (see
   * `participantAssignmentSummary.ts` / `validateSplit.ts`). */
  assignmentSummaries?: Record<string, ParticipantAssignmentSummary>;
  /** Required whenever `assignmentSummaries` is passed, to format each
   * chip's subtotal. */
  currencyCode?: string;
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
 *
 * Visual language (ABA — "every chip lights up at once, so it reads as 'all
 * selected'" fix): a chip is a TARGET you tap, never a SELECTED value, so it
 * must never look "chosen" the way a filled/highlighted control does.
 *  - `awaitingAssignment` gives every chip a dashed primary-colored outline —
 *    the SAME visual idiom the "+ Add person" chip already uses for "this is
 *    an actionable control right now" — not a filled background. A filled
 *    chip would read as "this one is picked"; a dashed outline reads as "tap
 *    any of these".
 *  - the thing that IS actually selected (the line item) gets its own
 *    distinct treatment on the item row itself (a radio-button icon +
 *    background tint — see `app/expense/split.tsx`), so "selected" and
 *    "tappable target" never share one visual language.
 *  - each chip additionally shows how many items are assigned to it (and
 *    their running subtotal), so a glance at the row answers "who has
 *    something, who has nothing, how far along is this" — the reason Create
 *    may be disabled is now visible per-person, not just in a bottom-of-screen
 *    hint.
 */
export function ParticipantChips({
  participants,
  awaitingAssignment,
  assignmentSummaries,
  currencyCode,
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
      {participants.map((p) => {
        const summary = assignmentSummaries?.[p.id];
        const hasNoItems = !!summary && summary.count === 0;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, awaitingAssignment && styles.chipAwaiting]}
            onPress={canEdit ? () => onPress(p.id) : undefined}
            activeOpacity={canEdit ? 0.7 : 1}
          >
            <View style={styles.chipBody}>
              <Text style={styles.chipText} numberOfLines={1}>
                {p.name}
              </Text>
              {summary && (
                <Text
                  style={[styles.chipSummary, hasNoItems && styles.chipSummaryWarning]}
                  numberOfLines={1}
                >
                  {t('receiptSplit.chipItemCount', { count: summary.count })}
                  {/* The subtotal is a CLIENT-SIDE aggregate for guidance only — the "~"
                      prefix + muted styling keep it from being mistaken for the server's
                      authoritative `amount` (see participantAssignmentSummary.ts). Omitted
                      entirely at 0 items, where there is nothing to total yet. */}
                  {summary.count > 0 && currencyCode
                    ? ` · ~${formatCurrency(summary.subtotal, currencyCode)}`
                    : ''}
                </Text>
              )}
            </View>
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
        );
      })}
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
  // Dashed outline, no fill — a "you can drop the selected item on any of
  // these" cue, deliberately NOT the filled/solid look a "this is selected"
  // state would use elsewhere in the app. Mirrors the "+ Add person" chip's
  // existing dashed-border treatment below.
  chipAwaiting: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
  },
  chipBody: {
    flexDirection: 'column' as const,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  chipSummary: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  // Flags "nothing assigned yet" — the same condition that makes the server
  // reject this participant with a 0 share (validateSplit.ts mirrors this
  // server rule client-side to disable Create). Per-chip and in-place, so the
  // reason Create is disabled is visible right next to the person it's about.
  chipSummaryWarning: {
    color: theme.colors.danger,
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
