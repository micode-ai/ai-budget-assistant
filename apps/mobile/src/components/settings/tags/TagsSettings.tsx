import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTagStore } from '@/stores/tagStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Tag } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * Stable accessible-name id for the create/edit sheet's title, wired to the
 * desktop dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `ExpenseDialog.tsx`'s and `CategoriesSettings.tsx`'s are: only one instance
 * is ever mounted at a time.
 */
const TAG_SHEET_TITLE_ID = 'tag-sheet-title';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#F7DC6F', '#82E0AA',
  '#D4A574', '#BB8FCE', '#F1948A', '#AED6F1',
];

/**
 * The tags screen's body: the tag list, plus the sheet that creates and edits
 * one.
 *
 * Lifted out of `app/tags/manage.tsx` — this is wave 4's first extraction, and
 * the first pane whose route was never under `app/settings/`; `SettingsRoute`
 * doesn't care where the route file lives, only that `src/` cannot host it
 * directly. The route is now a thin wrapper around `SettingsRoute`, with its
 * `<Stack.Screen>` title kept as a sibling in the route file — moving it here
 * would be the one thing wave 3's ruling forbids an extracted body.
 *
 * Two mechanical differences from the original body, both required by that
 * hosting and both matching `CategoriesSettings.tsx`'s precedent: the outer
 * `SafeAreaView` is gone (`SettingsScreenFrame` supplies it full-page, same
 * `edges={[]}`, same background) and the root `ScrollView` is
 * `SettingsScreenScroll` (a plain `View` in a pane, since the shell owns the
 * page scroll and a nested scroller would be the second one the design
 * language forbids).
 *
 * **A third difference, and it is not mechanical: `loadTags()` is now keyed on
 * `currentAccountId`, not `[]`.** A pane stays mounted across an account
 * switch — switching accounts from the desktop top bar does not navigate away
 * from `/tags/manage` — so the old mount-once effect would go on showing the
 * previous account's tags after a switch. **This also changes mobile
 * behaviour**: `currentAccountId` can change while this screen is open there
 * too (e.g. a trip-invite deep link, or the silent same-account fallback in
 * `loadAccountsFromServer`), even with no switcher control on this screen, and
 * the phone had the identical staleness bug. Re-running `loadTags()` on that
 * change is a correctness fix in both directions, not a desktop-only concern.
 *
 * **The one-frame flash this keying leaves behind is accepted, not closed.**
 * `accountStore`'s `clearAccountScopedCaches()` already empties
 * `priceHistoryStore`/`merchantRulesStore` synchronously before any
 * `[currentAccountId]` effect runs, and the same could be done here by giving
 * `tagStore`/`projectStore` a `reset()`. It was not: `ExpenseCreateForm.tsx`
 * and `IncomeCreateForm.tsx` both load tags (and projects) in a mount-only
 * effect and hand the list to `TagPicker`/`ProjectPicker`, neither of which
 * reloads on an empty list the way `useAnalytics.ts`'s `if (tags.length === 0)
 * loadTags()` does — so a `reset()` fired while either create form happened
 * to be open would leave its tag/project picker permanently empty for the
 * rest of that mount, which is worse than the flash it would remove. See the
 * task report for the full consumer survey; a future change that closes this
 * gap should audit those two forms first.
 *
 * The `Modal` is now a `SheetDialog` (ten call sites already use it) rather
 * than a raw RN `Modal` — in a pane a raw `Modal` slides up the full width of
 * the window from its bottom edge, covering the list being edited.
 * `keyboardAvoiding` is kept: this sheet contains a `TextInput` and no desktop
 * check would catch its loss. `padBottom={theme.spacing[4]}` +
 * `insetFloor={theme.spacing[6]}` reproduce this screen's own prior
 * `Math.max(insets.bottom, 24) + 16` exactly (`theme.spacing[6] === 24`,
 * `theme.spacing[4] === 16`), and this screen no longer reads a safe-area
 * inset of its own — `SheetDialog` owns that composition now, in one place
 * rather than a tenth hand-copied one. `scrimColor="rgba(0,0,0,0.4)"` is
 * passed because that is the literal backdrop colour this screen already
 * used, which is not what `SheetDialog`'s themed default (`theme.colors
 * .overlay`, 0.5 light / 0.7 dark) would draw — every other box (the sheet's
 * padding, the handle) already matched the wrapper's canonical default and
 * needed no override.
 */
export function TagsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const { tags, loadTags, createTag, deleteTag, updateTag } = useTagStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTags();
  }, [currentAccountId]);

  const openCreate = () => {
    setEditingTag(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setName(tag.name);
    setSelectedColor(tag.color || PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTag(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      if (editingTag) {
        await updateTag(editingTag.id, { name: trimmed, color: selectedColor });
      } else {
        await createTag(trimmed);
      }
      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (tag: Tag) => {
    showAlert(t('tags.deleteTag'), t('tags.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteTag(tag.id) },
    ]);
  };

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('tags.manageTags')}</Text>
          {canEdit && (
            <TouchableOpacity onPress={openCreate} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          {tags.length === 0 ? (
            <Text style={styles.empty}>{t('tags.noTags')}</Text>
          ) : (
            tags.map((tag, i) => (
              <React.Fragment key={tag.id}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={canEdit ? () => openEdit(tag) : undefined}
                    activeOpacity={canEdit ? 0.7 : 1}
                  >
                    <View style={[styles.colorDot, { backgroundColor: tag.color || theme.colors.textTertiary }]} />
                    <View style={styles.nameContainer}>
                      <Text style={styles.name}>{tag.name}</Text>
                      <Text style={styles.sub}>
                        {t('tags.usedInExpenses', { count: tag.usageCount || 0 })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {canEdit && (
                    <TouchableOpacity onPress={() => handleDelete(tag)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
                {i < tags.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>
      </SettingsScreenScroll>

      <SheetDialog
        visible={modalVisible}
        onClose={closeModal}
        titleId={TAG_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.4)"
      >
        <Text nativeID={TAG_SHEET_TITLE_ID} style={styles.modalTitle}>
          {editingTag ? t('tags.editTag') : t('tags.addTag')}
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('tags.tagName')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          autoCapitalize="words"
          maxLength={50}
        />

        <View style={styles.colorGrid}>
          {PRESET_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorCircle,
                { backgroundColor: color },
                selectedColor === color && styles.colorCircleSelected,
              ]}
              onPress={() => setSelectedColor(color)}
            >
              {selectedColor === color && (
                <Ionicons name="checkmark" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving || !name.trim()}
          >
            <Text style={styles.saveText}>
              {editingTag ? t('common.save') : t('tags.createTag')}
            </Text>
          </TouchableOpacity>
        </View>
      </SheetDialog>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  colorGrid: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const,
    gap: theme.spacing[2.5], marginBottom: theme.spacing[6],
  },
  colorCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  colorCircleSelected: {
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
