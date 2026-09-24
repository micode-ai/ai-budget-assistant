import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Target } from '@/features/categorize/categorizeReview';

export interface CategoryTargetPickerOption {
  id: string;
  name: string;
  icon?: string;
}

interface Props {
  visible: boolean;
  categories: CategoryTargetPickerOption[];
  /** This pass's proposals, by draftKey — lets a row/group point at a new category someone else already drafted. */
  drafts: Record<string, string>;
  onSelect: (target: Target) => void;
  /** Caller dispatches `addDraft` + the matching set-target action. */
  onCreate: (name: string) => void;
  onClose: () => void;
}

/**
 * Bottom-anchored category picker shared by the row-level "choose" action and
 * the group-level retarget chevron in `CategorizeReview`. Lists this pass's
 * draft (not-yet-created) categories first, then the account's existing
 * expense categories, then a "create new" row that expands into a name field.
 */
export function CategoryTargetPicker({ visible, categories, drafts, onSelect, onCreate, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Selecting an existing category or a draft closes the picker via `onSelect`
  // without going through `handleClose` — reset here too, keyed on `visible`,
  // so the next open never shows a stale expanded create-panel/typed name.
  useEffect(() => {
    if (visible) {
      setCreating(false);
      setNewName('');
    }
  }, [visible]);

  const handleClose = () => {
    setCreating(false);
    setNewName('');
    onClose();
  };

  const handleCreateConfirm = () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) return;
    onCreate(trimmed);
    setCreating(false);
    setNewName('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
        />
        {/* The system navigation bar overlays this window, so the base padding
            has to clear it (ABA-483) — the inset is added here, not in the
            StyleSheet, so there is one source for the padding formula. */}
        <View style={[styles.sheet, { paddingBottom: theme.spacing[4] + insets.bottom }]}>
          <View style={styles.handle} />
          <ScrollView style={styles.scroll}>
            {Object.entries(drafts).map(([draftKey, name]) => (
              <Pressable
                key={`draft-${draftKey}`}
                style={styles.row}
                onPress={() => onSelect({ kind: 'new', draftKey })}
                accessibilityRole="button"
              >
                <Text style={styles.rowText} numberOfLines={1}>
                  ✚ {name || t('categorize.newNamePlaceholder')}
                </Text>
              </Pressable>
            ))}
            {categories.map((c) => (
              <Pressable
                key={c.id}
                style={styles.row}
                onPress={() => onSelect({ kind: 'existing', categoryId: c.id })}
                accessibilityRole="button"
              >
                <Text style={styles.rowText} numberOfLines={1}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.row}
              onPress={() => setCreating((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={[styles.rowText, styles.createNewText]}>{t('categorize.createNew')}</Text>
            </Pressable>
            {creating && (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.input}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t('categorize.newNamePlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  autoFocus
                  onSubmitEditing={handleCreateConfirm}
                />
                <Pressable
                  style={[styles.okButton, newName.trim().length < 2 && styles.okButtonDisabled]}
                  onPress={handleCreateConfirm}
                  disabled={newName.trim().length < 2}
                  accessibilityRole="button"
                >
                  <Text style={styles.okButtonText}>{t('common.ok')}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    maxWidth: 520,
    width: '100%' as const,
    alignSelf: 'center' as const,
    maxHeight: '75%' as const,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  createNewText: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.medium,
  },
  createRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
  },
  input: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  okButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
  },
  okButtonDisabled: {
    opacity: 0.4,
  },
  okButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
