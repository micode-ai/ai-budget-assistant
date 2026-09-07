import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '@/stores/categoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Category } from '@budget/shared-types';
import { SettingsScreenScroll } from '../SettingsScreenScroll';


/**
 * Stable accessible-name id for the create/edit sheet's title, wired to the
 * desktop dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `ExpenseDialog.tsx`'s is: only one instance is ever mounted at a time.
 */
const CATEGORY_SHEET_TITLE_ID = 'category-sheet-title';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#F7DC6F', '#82E0AA',
  '#D4A574', '#BB8FCE', '#F1948A', '#AED6F1',
];

/**
 * The categories screen's body: the expense and income category lists, plus
 * the sheet that creates and edits one.
 *
 * Lifted out of `app/settings/categories.tsx` unchanged so the desktop settings
 * shell can host it — `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same background),
 * and the root `ScrollView` is `SettingsScreenScroll` — the same `ScrollView`
 * full-page, a plain `View` in a pane, because the shell owns the page scroll
 * and a nested scroller would be the second scrollbar the language forbids.
 *
 * **The root here was a bare `ScrollView`, not a `KeyboardAwareScreen`.** The
 * `KeyboardAvoidingScreen` this file imports wraps the *modal*, not the page,
 * so it is untouched and `SettingsScreenKeyboardScroll` — written for
 * `security`, whose root really is one — is deliberately not used. Which
 * wrapper a screen reaches for is a fact about that screen, read from it.
 *
 * The `Modal` stays a sibling of the scroller rather than moving inside it, as
 * it is today: `SettingsScreenFrame`'s `SafeAreaView` wraps both, so the
 * full-page tree is the one the phone renders now.
 *
 * **This screen no longer reads a safe-area inset at all.** It used to hold
 * `useSafeAreaInsets()` for its own bottom-anchored `Modal`, with a note here
 * saying that was deliberately not `useSettingsPane().bottomInset` — true at
 * the time, and superseded: the sheet is now a `SheetDialog`, which owns both
 * the inset (ABA-483's rule, in one place rather than nine) and the desktop
 * chrome. `useSettingsPane().bottomInset` is still the wrong number for it,
 * and still not what is used; the right one is simply no longer this screen's
 * to compose.
 */
export function CategoriesSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const {
    getExpenseCategories,
    getIncomeCategories,
    deleteCategory,
    createCategory,
    updateCategory,
  } = useCategoryStore();

  const expenseCategories = getExpenseCategories();
  const incomeCategories = getIncomeCategories();

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [modalType, setModalType] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  const openCreateModal = (type: 'expense' | 'income') => {
    setEditingCategory(null);
    setModalType(type);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setModalType(category.type as 'expense' | 'income');
    setName(category.name);
    setSelectedColor(category.color || PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert(t('common.error'), t('categoryCreate.nameRequired'));
      return;
    }

    setIsSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, { name: trimmed, color: selectedColor });
      } else {
        await createCategory(trimmed, modalType, undefined, selectedColor);
      }
      closeModal();
    } catch {
      showAlert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (category: Category) => {
    showAlert(
      t('categories.deleteConfirmTitle'),
      t('categories.deleteConfirmMessage', { name: category.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('categories.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(category.id);
              showAlert(t('categories.deleteSuccess'));
            } catch (error: any) {
              if (error?.status === 409) {
                const d = error.details || {};
                showAlert(
                  t('common.error'),
                  t('categories.deleteErrorHasRecords', {
                    expenses: d.expenses || 0,
                    incomes: d.incomes || 0,
                    budgets: d.budgets || 0,
                    other: (d.budgetCategories || 0) + (d.splits || 0) + (d.children || 0),
                  }),
                );
              } else {
                showAlert(t('common.error'), error?.message || t('common.error'));
              }
            }
          },
        },
      ],
    );
  };

  const renderCategory = (category: Category) => (
    <View key={category.id} style={styles.row}>
      <TouchableOpacity
        style={styles.rowContent}
        onPress={canEdit ? () => openEditModal(category) : undefined}
        activeOpacity={canEdit ? 0.7 : 1}
      >
        <View style={[styles.colorDot, { backgroundColor: category.color || theme.colors.textTertiary }]} />
        <CategoryIcon
          icon={category.icon}
          size={20}
          color={theme.colors.textSecondary}
          style={styles.icon}
        />
        <View style={styles.nameContainer}>
          <Text style={styles.name}>{category.name}</Text>
          {category.isSystem && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('categories.system')}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      {canEdit && (
        <TouchableOpacity onPress={() => handleDelete(category)} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSection = (title: string, items: Category[], type: 'expense' | 'income') => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {canEdit && (
          <TouchableOpacity onPress={() => openCreateModal(type)} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.card}>
        {items.length === 0 ? (
          <Text style={styles.empty}>{t('categories.empty')}</Text>
        ) : (
          items.map((cat, i) => (
            <React.Fragment key={cat.id}>
              {renderCategory(cat)}
              {i < items.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderSection(t('categories.expenseCategories'), expenseCategories, 'expense')}
        {renderSection(t('categories.incomeCategories'), incomeCategories, 'income')}
      </SettingsScreenScroll>

      <SheetDialog
        visible={modalVisible}
        onClose={closeModal}
        titleId={CATEGORY_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.4)"
      >
        <Text nativeID={CATEGORY_SHEET_TITLE_ID} style={styles.modalTitle}>
          {editingCategory ? t('categories.edit') : t('categories.add')}
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('categoryCreate.namePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
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
            disabled={isSaving}
          >
            <Text style={styles.saveText}>
              {editingCategory ? t('categories.save') : t('categoryCreate.create')}
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
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
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
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  icon: { marginLeft: theme.spacing[2] },
  nameContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: theme.spacing[2],
    gap: theme.spacing[2],
  },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  badge: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  badgeText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontSize: 10 },
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
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  colorGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[6],
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
