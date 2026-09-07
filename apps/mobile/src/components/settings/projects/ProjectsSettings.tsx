import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { SheetDialog } from '@/components/SheetDialog';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Project } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * Stable accessible-name id for the create sheet's title, wired to the
 * desktop dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `TagsSettings.tsx`'s and `CategoriesSettings.tsx`'s are: only one instance
 * is ever mounted at a time.
 */
const PROJECT_SHEET_TITLE_ID = 'project-sheet-title';

const PROJECT_COLORS = [
  '#6366F1', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6B7280',
  '#FF6B6B', '#4ECDC4',
];

/**
 * The projects screen's body: the active/archived project lists, plus the
 * sheet that creates one.
 *
 * Lifted out of `app/projects/index.tsx` — the second extraction whose route
 * was never under `app/settings/`, same as `tags/manage`. The route is now a
 * thin wrapper around `SettingsRoute`, with its `<Stack.Screen>` title kept as
 * a sibling in the route file — moving it here would be the one thing wave
 * 3's ruling forbids an extracted body.
 *
 * The same two mechanical differences from the original body as
 * `TagsSettings.tsx`: the outer `SafeAreaView` is gone (`SettingsScreenFrame`
 * supplies it full-page, same `edges={[]}`, same background) and the root
 * `ScrollView` is `SettingsScreenScroll` (a plain `View` in a pane, since the
 * shell owns the page scroll).
 *
 * **A third difference, and it is not mechanical: `loadProjects()` is now
 * keyed on `currentAccountId`, not `[]`.** A pane stays mounted across an
 * account switch — switching accounts from the desktop top bar does not
 * navigate away from `/projects` — so the old mount-once effect would go on
 * showing the previous account's projects after a switch. **This also changes
 * mobile behaviour**, for exactly the reason `TagsSettings.tsx` documents:
 * `currentAccountId` can change while this screen is open on a phone too (a
 * trip-invite deep link, the silent same-account fallback in
 * `loadAccountsFromServer`), and re-running `loadProjects()` on that change is
 * a correctness fix in both directions, not a desktop-only concern.
 *
 * The flash this keying would otherwise leave behind is already closed:
 * `projectStore.reset()` is wired into `accountStore.clearAccountScopedCaches()`
 * alongside `tagStore.reset()` (see that file, and `TagsSettings.tsx`'s own
 * comment, for the full accounting of why a reset beats accepting the flash).
 * That decision was made once, for both stores, in wave 4's first task — it is
 * inherited here, not re-litigated.
 *
 * The create `Modal` is now a `SheetDialog`, for the same reason as
 * `TagsSettings.tsx`: in a pane a raw `Modal` slides up the full width of the
 * window from its bottom edge, covering the list being created into.
 * `keyboardAvoiding` is kept (this sheet has three `TextInput`s). The same
 * `padBottom`/`insetFloor` pair reproduces this screen's own prior
 * `Math.max(insets.bottom, 24) + 16` exactly, so this screen no longer reads a
 * safe-area inset of its own. `scrimColor="rgba(0,0,0,0.4)"` is passed for the
 * same reason as `TagsSettings.tsx`: it is the literal backdrop colour this
 * screen already used, not `SheetDialog`'s themed default.
 *
 * The one outbound push — a row opening `/projects/[id]` — is untouched: that
 * route is not extracted, not moved, and gets no dialog. Its only edit/delete
 * affordances live in that route's own `<Stack.Screen>` header.
 */
export function ProjectsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const { loadProjects, getActiveProjects, getArchivedProjects, createProject, deleteProject } =
    useProjectStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [budget, setBudget] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [currentAccountId]);

  const openCreate = () => {
    setName('');
    setDescription('');
    setSelectedColor(PROJECT_COLORS[0]);
    setBudget('');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setName('');
    setDescription('');
    setSelectedColor(PROJECT_COLORS[0]);
    setBudget('');
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { showAlert(t('common.error'), t('projects.projectName')); return; }
    setIsSaving(true);
    try {
      await createProject({
        name: trimmed,
        description: description.trim() || undefined,
        color: selectedColor,
        budget: budget ? parseAmount(budget) : undefined,
      });
      closeModal();
    } catch {
      showAlert(t('common.error'), t('common.retry'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (project: Project) => {
    showAlert(t('projects.deleteProject'), t('projects.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteProject(project.id) },
    ]);
  };

  const renderSection = (title: string, items: Project[], showAdd: boolean) => {
    if (items.length === 0 && !showAdd) return null;
    return (
      <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {showAdd && canEdit && (
            <TouchableOpacity onPress={openCreate} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.card}>
          {items.length === 0 ? (
            <Text style={styles.empty}>{t('projects.noProjects')}</Text>
          ) : (
            items.map((project, i) => (
              <React.Fragment key={project.id}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={() => router.push(`/projects/${project.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.colorDot, { backgroundColor: project.color || theme.colors.primary }]} />
                    <View style={styles.nameContainer}>
                      <Text style={styles.name}>{project.name}</Text>
                      {project.description ? (
                        <Text style={styles.sub} numberOfLines={1}>{project.description}</Text>
                      ) : null}
                      {project.budget ? (
                        <Text style={styles.budgetText}>
                          {t('projects.budget')}: {project.currencyCode || ''} {Number(project.budget).toFixed(2)}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                  {canEdit && (
                    <>
                      <View style={styles.separator} />
                      <TouchableOpacity onPress={() => handleDelete(project)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                {i < items.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>
      </>
    );
  };

  const active = getActiveProjects();
  const archived = getArchivedProjects();

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderSection(t('projects.activeProjects'), active, true)}
        {renderSection(t('projects.archivedProjects'), archived, false)}
      </SettingsScreenScroll>

      <SheetDialog
        visible={modalVisible}
        onClose={closeModal}
        titleId={PROJECT_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.4)"
      >
        <Text nativeID={PROJECT_SHEET_TITLE_ID} style={styles.modalTitle}>
          {t('projects.createProject')}
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('projects.projectName')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          maxLength={100}
        />
        <TextInput
          style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('projects.description')}
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          maxLength={300}
        />
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          placeholder={t('projects.budget')}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="decimal-pad"
        />

        <View style={styles.colorGrid}>
          {PROJECT_COLORS.map((color) => (
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
            onPress={handleCreate}
            disabled={isSaving || !name.trim()}
          >
            <Text style={styles.saveText}>{t('projects.createProject')}</Text>
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
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3], marginRight: theme.spacing[2] },
  name: { ...theme.textStyles.body, fontWeight: '500' as const, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: 2 },
  budgetText: { ...theme.textStyles.bodySm, color: theme.colors.primary, marginTop: 2 },
  separator: { width: theme.spacing[3] },
  divider: {
    height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body, color: theme.colors.textTertiary,
    textAlign: 'center' as const, paddingVertical: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16, color: theme.colors.textPrimary, marginBottom: theme.spacing[3],
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
