import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Project } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

const PROJECT_COLORS = [
  '#6366F1', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6B7280',
  '#FF6B6B', '#4ECDC4',
];

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('projects.title') }} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderSection(t('projects.activeProjects'), active, true)}
        {renderSection(t('projects.archivedProjects'), archived, false)}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('projects.createProject')}</Text>

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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
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
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const, marginBottom: theme.spacing[4],
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
