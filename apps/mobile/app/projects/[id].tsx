import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Project } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

const PROJECT_COLORS = [
  '#6366F1', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6B7280',
  '#FF6B6B', '#4ECDC4',
];

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { projects, updateProject, deleteProject } = useProjectStore();
  const expenses = useExpenseStore((s) => s.expenses);
  const { getCategoryById } = useCategoryStore();

  const project = projects.find((p) => p.id === id);

  const [editVisible, setEditVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [budget, setBudget] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = (p: Project) => {
    setName(p.name);
    setDescription(p.description || '');
    setSelectedColor(p.color || PROJECT_COLORS[0]);
    setBudget(p.budget ? String(p.budget) : '');
    setEditVisible(true);
  };

  const closeEdit = () => setEditVisible(false);

  const handleSave = async () => {
    if (!project) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await updateProject(project.id, {
        name: trimmed,
        description: description.trim() || undefined,
        color: selectedColor,
        budget: budget ? parseFloat(budget) : undefined,
      });
      closeEdit();
    } catch {
      Alert.alert(t('common.error'), t('common.retry'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!project) return;
    Alert.alert(t('projects.deleteProject'), t('projects.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => { deleteProject(project.id); router.back(); },
      },
    ]);
  };

  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === id && !e.isDeleted && !e.isDebt),
    [expenses, id],
  );

  const totalSpent = useMemo(
    () => projectExpenses.reduce((sum, e) => sum + e.amount, 0),
    [projectExpenses],
  );

  if (!project) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.notFound}>Project not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: canEdit ? () => (
            <View style={{ flexDirection: 'row', gap: 16, marginRight: 16 }}>
              <TouchableOpacity onPress={() => openEdit(project)} hitSlop={8}>
                <Ionicons name="pencil-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ) : undefined,
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={[styles.colorStripe, { backgroundColor: project.color || theme.colors.primary }]} />
          <View style={styles.infoContent}>
            {project.description ? (
              <Text style={styles.desc}>{project.description}</Text>
            ) : null}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t('projects.totalSpent')}</Text>
                <Text style={[styles.statValue, { color: theme.colors.danger }]}>
                  {totalSpent.toFixed(2)}
                </Text>
              </View>
              {project.budget ? (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>{t('projects.budgetRemaining')}</Text>
                  <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                    {(Number(project.budget) - totalSpent).toFixed(2)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t('nav.expenses')}</Text>
                <Text style={styles.statValue}>{projectExpenses.length}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Expenses list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('nav.expenses')}</Text>
        </View>
        <View style={styles.card}>
          {projectExpenses.length === 0 ? (
            <Text style={styles.empty}>{t('projects.noExpenses')}</Text>
          ) : (
            projectExpenses
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((expense, i) => {
                const cat = expense.categoryId ? getCategoryById(expense.categoryId) : undefined;
                return (
                  <React.Fragment key={expense.id}>
                    <TouchableOpacity
                      style={styles.expenseRow}
                      onPress={() => router.push(`/expense/${expense.localId}`)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.catDot, { backgroundColor: cat?.color || theme.colors.textTertiary }]} />
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseName} numberOfLines={1}>
                          {expense.merchant || expense.description || cat?.name || '—'}
                        </Text>
                        <Text style={styles.expenseDate}>
                          {new Date(expense.date).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={[styles.expenseAmount, { color: theme.colors.danger }]}>
                        -{expense.amount.toFixed(2)} {expense.currencyCode}
                      </Text>
                    </TouchableOpacity>
                    {i < projectExpenses.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })
          )}
        </View>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={closeEdit}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeEdit} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('projects.editProject')}</Text>

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
              <TouchableOpacity style={styles.cancelButton} onPress={closeEdit}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving || !name.trim()}
              >
                <Text style={styles.saveText}>{t('common.save')}</Text>
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
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  notFound: {
    textAlign: 'center' as const, marginTop: 48,
    color: theme.colors.textTertiary, fontSize: 16,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden' as const,
    marginBottom: theme.spacing[4],
  },
  colorStripe: { height: 4 },
  infoContent: { padding: theme.spacing[4] },
  desc: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  statsRow: { flexDirection: 'row' as const, gap: theme.spacing[4] },
  stat: { flex: 1, alignItems: 'center' as const },
  statLabel: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700' as const, color: theme.colors.textPrimary },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  expenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  expenseInfo: { flex: 1, marginLeft: theme.spacing[3] },
  expenseName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  expenseDate: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  expenseAmount: { fontSize: 14, fontWeight: '600' as const },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
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
