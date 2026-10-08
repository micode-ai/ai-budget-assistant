import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { MAX_MEMBER_NAME_LENGTH } from '@/features/groups/groupSplit';
import type { GroupMember } from '@budget/shared-types';
import { GroupButton } from './GroupButton';

interface GroupMemberSheetProps {
  member: GroupMember | null;
  canRename: boolean;
  /** Null hides the button (the owner cannot remove themselves). */
  removeLabel: string | null;
  onClose: () => void;
  onRename: (memberId: string, name: string) => Promise<void>;
  onRemove: (member: GroupMember) => void;
}

/**
 * Bottom sheet for one member: rename and remove. Anchored to the bottom edge, so its padding adds
 * the system navigation bar inset or the last button is untappable on a three-button device
 * (ABA-483).
 */
export function GroupMemberSheet({
  member,
  canRename,
  removeLabel,
  onClose,
  onRename,
  onRemove,
}: GroupMemberSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: theme.spacing[6] + insets.bottom }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{member.displayName}</Text>
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
                disabled={!changed}
                style={styles.gap}
              />
            </>
          )}
          {removeLabel && (
            <GroupButton
              label={removeLabel}
              onPress={() => onRemove(member)}
              variant="danger"
              style={styles.gap}
            />
          )}
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.cancel')}</Text>
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
