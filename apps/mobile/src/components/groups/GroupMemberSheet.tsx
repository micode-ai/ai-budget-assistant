import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';
import { MAX_MEMBER_NAME_LENGTH } from '@/features/groups/groupSplit';
import type { GroupMember } from '@budget/shared-types';
import { GroupButton } from './GroupButton';

/** Only one instance is ever mounted (`GroupMembersView` renders a single sheet). */
const TITLE_ID = 'group-member-sheet-title';

interface GroupMemberSheetProps {
  member: GroupMember | null;
  canRename: boolean;
  /** Null hides the button (the owner cannot remove themselves). */
  removeLabel: string | null;
  onClose: () => void;
  onRename: (memberId: string, name: string) => Promise<void>;
  onRemove: (member: GroupMember) => void;
  /** ABA-650: the owner looking at another app-user member. Optional, so other hosts stay unchanged. */
  canMakeOwner?: boolean;
  onMakeOwner?: (member: GroupMember) => void;
  /** ABA-651: the owner looking at a claimed guest. Optional, so other hosts stay unchanged. */
  canResetClaim?: boolean;
  onResetClaim?: (member: GroupMember) => void;
}

/**
 * One member: rename, make owner (ABA-650), reset a guest's browser login (ABA-651) and remove. A bottom sheet on a phone, a centred dialog on desktop web (via
 * `SheetDialog`, which also owns the system navigation bar inset, ABA-483, so the last button
 * stays tappable on a three-button device).
 */
export function GroupMemberSheet({
  member,
  canRename,
  removeLabel,
  onClose,
  onRename,
  onRemove,
  canMakeOwner = false,
  onMakeOwner,
  canResetClaim = false,
  onResetClaim,
}: GroupMemberSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(member?.displayName ?? '');
  }, [member]);

  if (!member) return null;
  const changed = name.trim().length > 0 && name.trim() !== member.displayName;

  const save = async () => {
    setSaving(true);
    try {
      await onRename(member.id, name.trim());
      onClose();
    } catch {
      // The caller shows the error; keep the sheet open so the name can be corrected.
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetDialog
      visible
      onClose={onClose}
      titleId={TITLE_ID}
      // Phone pixels must not move (ABA-483 / ABA-646): these three reproduce the sheet this
      // component drew before it moved onto SheetDialog. The default bottom padding (24 plus the
      // nav-bar inset) is exactly what it computed by hand, so `padBottom` is not passed.
      sheetStyle={styles.sheetBox}
      handleStyle={styles.handle}
      scrimColor="rgba(0,0,0,0.45)"
    >
      <Text nativeID={TITLE_ID} style={styles.title}>
        {member.displayName}
      </Text>
      {canRename && (
        <>
          <Text style={styles.label}>{t('groups.renameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={MAX_MEMBER_NAME_LENGTH}
            placeholderTextColor={theme.colors.textTertiary}
          />
          <GroupButton
            label={t('common.save')}
            onPress={save}
            loading={saving}
            write
            disabled={!changed}
            style={styles.gap}
          />
        </>
      )}
      {canMakeOwner && onMakeOwner && (
        <GroupButton
          label={t('groups.makeOwner')}
          onPress={() => onMakeOwner(member)}
          variant="secondary"
          write
          style={styles.gap}
        />
      )}
      {canResetClaim && onResetClaim && (
        <>
          <GroupButton
            label={t('groups.resetClaim')}
            onPress={() => onResetClaim(member)}
            variant="secondary"
            write
            style={styles.gap}
          />
          <Text style={styles.hint}>{t('groups.resetClaimHint')}</Text>
        </>
      )}
      {removeLabel && (
        <GroupButton
          label={removeLabel}
          onPress={() => onRemove(member)}
          variant="danger"
          write
          style={styles.gap}
        />
      )}
      <TouchableOpacity style={styles.close} onPress={onClose}>
        <Text style={styles.closeText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  // `SheetDialog` owns the scrim, the bottom anchoring and the base sheet box; these are only the
  // deviations that keep this sheet's phone rendering as it was.
  sheetBox: {
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  handle: {
    width: 40,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  gap: {
    marginTop: theme.spacing[3],
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  close: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  closeText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
});
