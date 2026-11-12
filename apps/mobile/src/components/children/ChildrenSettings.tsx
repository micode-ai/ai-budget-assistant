import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Child } from '@budget/shared-types';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { SettingsScreenScroll } from '@/components/settings/SettingsScreenScroll';
import { useAccountStore } from '@/stores/accountStore';
import { CHILD_NAME_MAX, useChildStore } from '@/stores/childStore';
import { useAccountChildren } from '@/hooks/useAccountChildren';
import { useTheme, useStyles, type Theme } from '@/theme';

/** Stable accessible-name id for the sheet's title (only one instance is ever mounted). */
const CHILD_SHEET_TITLE_ID = 'child-sheet-title';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#F7DC6F', '#82E0AA',
  '#D4A574', '#BB8FCE', '#F1948A', '#AED6F1',
];

/**
 * Settings → Children: the account's children, by name only.
 *
 * The reference-data layout (`docs/wiki/features/reference-data-screens.md`):
 * a section header with `+`, one card of rows, an edit sheet (name + colour).
 * Children are archived, never deleted — an archived child keeps every
 * attribution and can still produce a statement — so the row's trailing
 * action is Archive, and the archived list sits collapsed below the active one
 * with Unarchive on each row. Viewers see the lists with no write affordance.
 *
 * Lives under `src/` so the desktop settings shell can host it as a pane; the
 * route `app/settings/children.tsx` is a thin `SettingsRoute` wrapper.
 *
 * Loads with `refresh` on every mount and account switch (a pane stays
 * mounted across a switch). A failed load shows a retry, never "no children".
 */
export function ChildrenSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const { activeChildren, archivedChildren, isLoaded, isLoading, loadFailed, reload } = useAccountChildren({
    refresh: true,
  });
  const createChild = useChildStore((s) => s.createChild);
  const renameChild = useChildStore((s) => s.renameChild);
  const setChildColor = useChildStore((s) => s.setChildColor);
  const setArchived = useChildStore((s) => s.setArchived);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Child | null>(null);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSelectedColor(PRESET_COLORS[activeChildren.length % PRESET_COLORS.length]);
    setModalVisible(true);
  };

  const openEdit = (child: Child) => {
    setEditing(child);
    setName(child.name);
    setSelectedColor(child.color || PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditing(null);
    setName('');
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      if (editing) {
        if (trimmed !== editing.name) await renameChild(editing.id, trimmed);
        if (selectedColor !== editing.color) await setChildColor(editing.id, selectedColor);
      } else {
        await createChild(trimmed, selectedColor);
      }
      closeModal();
    } catch (e) {
      console.warn('[children] save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('children.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleArchived = (child: Child, archived: boolean) => {
    const run = async () => {
      try {
        await setArchived(child.id, archived);
      } catch (e) {
        console.warn('[children] archive failed:', e instanceof Error ? e.message : String(e));
        showAlert(t('common.error'), t('children.saveFailed'));
      }
    };
    if (!archived) {
      void run();
      return;
    }
    showAlert(t('children.archiveTitle', { name: child.name || t('children.unnamed') }), t('children.archiveMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('children.archive'), onPress: () => void run() },
    ]);
  };

  const renderRow = (child: Child, i: number, list: Child[], archived: boolean) => (
    <React.Fragment key={child.id}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowContent}
          onPress={canEdit ? () => openEdit(child) : undefined}
          activeOpacity={canEdit ? 0.7 : 1}
        >
          <View style={[styles.colorDot, { backgroundColor: child.color || theme.colors.textTertiary }]} />
          <Text style={[styles.name, archived && styles.nameArchived]} numberOfLines={1}>
            {child.name || t('children.unnamed')}
          </Text>
        </TouchableOpacity>
        {canEdit && (
          <TouchableOpacity
            onPress={() => toggleArchived(child, !archived)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={archived ? t('children.unarchive') : t('children.archive')}
          >
            <Ionicons
              name={archived ? 'arrow-undo-outline' : 'archive-outline'}
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {i < list.length - 1 && <View style={styles.divider} />}
    </React.Fragment>
  );

  let body: React.ReactNode;
  if (loadFailed) {
    body = (
      <View style={styles.stateBox}>
        <Text style={styles.empty}>{t('children.loadFailed')}</Text>
        <TouchableOpacity onPress={reload} accessibilityRole="button">
          <Text style={styles.retry}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!isLoaded && isLoading) {
    body = (
      <View style={styles.stateBox}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  } else if (activeChildren.length === 0) {
    body = <Text style={styles.empty}>{t('children.empty')}</Text>;
  } else {
    body = activeChildren.map((c, i, list) => renderRow(c, i, list, false));
  }

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('children.title')}</Text>
          {canEdit && !loadFailed && (
            <TouchableOpacity
              onPress={openCreate}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('children.addChild')}
            >
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>{body}</View>
        <Text style={styles.hint}>{t('children.hint')}</Text>

        {archivedChildren.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowArchived((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
            >
              <Text style={styles.sectionTitle}>
                {t('children.archivedSection', { count: archivedChildren.length })}
              </Text>
              <Ionicons
                name={showArchived ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
            {showArchived && (
              <View style={styles.card}>
                {archivedChildren.map((c, i, list) => renderRow(c, i, list, true))}
              </View>
            )}
          </>
        )}
      </SettingsScreenScroll>

      <SheetDialog
        visible={modalVisible}
        onClose={closeModal}
        titleId={CHILD_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={CHILD_SHEET_TITLE_ID} style={styles.modalTitle}>
          {editing ? t('children.editChild') : t('children.addChild')}
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('children.namePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          autoCapitalize="words"
          maxLength={CHILD_NAME_MAX}
        />

        <View style={styles.colorGrid}>
          {PRESET_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[styles.colorCircle, { backgroundColor: color }, selectedColor === color && styles.colorCircleSelected]}
              onPress={() => setSelectedColor(color)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedColor === color }}
            >
              {selectedColor === color && <Ionicons name="checkmark" size={16} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || !name.trim()) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving || !name.trim()}
          >
            <Text style={styles.saveText}>{editing ? t('common.save') : t('children.addChild')}</Text>
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
    minHeight: 32,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1, marginLeft: theme.spacing[3] },
  nameArchived: { color: theme.colors.textSecondary },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
  stateBox: { alignItems: 'center' as const, paddingVertical: theme.spacing[2], gap: theme.spacing[2] },
  retry: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
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
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
