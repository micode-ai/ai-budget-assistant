import { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Target } from '@/features/categorize/categorizeReview';
import { categoryStyle, tintOf } from '@/features/categorize/categoryStyle';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useIsDesktopWeb } from '@/components/webLayout.constants';

/** Above this many options the sheet gets a search field. */
const SEARCH_THRESHOLD = 8;

export interface CategoryTargetPickerOption {
  id: string;
  name: string;
  icon?: string;
  color?: string;
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
  // On desktop a bottom sheet pinned to the viewport's bottom edge landed on
  // top of the review dialog's footer, was clipped, and its scrim only dimmed
  // the column above it. There it is a centred panel like every other dialog.
  const isDesktop = useIsDesktopWeb();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');

  // Selecting an existing category or a draft closes the picker via `onSelect`
  // without going through `handleClose` — reset here too, keyed on `visible`,
  // so the next open never shows a stale expanded create-panel/typed name.
  useEffect(() => {
    if (visible) {
      setCreating(false);
      setNewName('');
      setQuery('');
    }
  }, [visible]);

  const handleClose = () => {
    setCreating(false);
    setNewName('');
    setQuery('');
    onClose();
  };

  const draftEntries = Object.entries(drafts);
  const showSearch = draftEntries.length + categories.length > SEARCH_THRESHOLD;
  const needle = showSearch ? query.trim().toLocaleLowerCase() : '';
  const matches = (name: string) => !needle || name.toLocaleLowerCase().includes(needle);
  const visibleDrafts = draftEntries.filter(([, name]) => matches(name));
  const visibleCategories = useMemo(
    () => categories.filter((c) => !needle || c.name.toLocaleLowerCase().includes(needle)),
    [categories, needle],
  );

  const renderIcon = (icon: string | undefined, color: string | undefined) => (
    <View style={[styles.iconCircle, { backgroundColor: tintOf(color, theme.colors.surfaceSecondary) }]}>
      <CategoryIcon
        icon={icon}
        size={16}
        color={color && /^#[0-9a-f]{6}$/i.test(color) ? color : theme.colors.textSecondary}
        fallback="folder-outline"
      />
    </View>
  );

  const handleCreateConfirm = () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) return;
    onCreate(trimmed);
    setCreating(false);
    setNewName('');
  };

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={handleClose}>
      <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
        <Pressable
          style={isDesktop ? styles.backdropFill : styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
        />
        {/* The system navigation bar overlays this window, so the base padding
            has to clear it (ABA-483) — the inset is added here, not in the
            StyleSheet, so there is one source for the padding formula. */}
        <View
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : { paddingBottom: theme.spacing[4] + insets.bottom },
          ]}
        >
          {!isDesktop && <View style={styles.handle} />}
          {showSearch && (
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('categorize.searchPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                autoCorrect={false}
              />
            </View>
          )}
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {visibleDrafts.map(([draftKey, name]) => {
              const style = categoryStyle(name, t);
              return (
                <Pressable
                  key={`draft-${draftKey}`}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => onSelect({ kind: 'new', draftKey })}
                  accessibilityRole="button"
                >
                  {renderIcon(style.icon, style.color)}
                  <Text style={styles.rowText} numberOfLines={1}>
                    {name || t('categorize.newNamePlaceholder')}
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t('categorize.newBadge')}</Text>
                  </View>
                </Pressable>
              );
            })}
            {visibleCategories.map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect({ kind: 'existing', categoryId: c.id })}
                accessibilityRole="button"
              >
                {renderIcon(c.icon, c.color)}
                <Text style={styles.rowText} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => setCreating((v) => !v)}
              accessibilityRole="button"
            >
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryLight }]}>
                <Ionicons name="add" size={18} color={theme.colors.primary} />
              </View>
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
  overlayDesktop: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  backdropFill: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.overlay,
  },
  sheetDesktop: {
    maxWidth: 440,
    width: '90%' as const,
    maxHeight: '70%' as const,
    borderRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    ...theme.shadows.xl,
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
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  searchInput: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing[2.5],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 52,
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  badge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  badgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.primary,
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
