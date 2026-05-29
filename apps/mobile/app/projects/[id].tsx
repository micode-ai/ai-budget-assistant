import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, updateProject, deleteProject } = useProjectStore();
  const expenses = useExpenseStore((s) => s.expenses);
  const { getCategoryById } = useCategoryStore();

  const project = projects.find((p) => p.id === id);

  const analytics = useMemo(() => {
    if (!id) return null;
    const projectExpenses = expenses.filter((e) => e.projectId === id && !e.isDeleted);
    const totalSpent = projectExpenses.reduce((sum, e) => sum + e.amount, 0);

    const byCategory: Record<string, { name: string; amount: number }> = {};
    for (const e of projectExpenses) {
      const catId = e.categoryId || '__none__';
      if (!byCategory[catId]) {
        const cat = e.categoryId ? getCategoryById(e.categoryId) : undefined;
        byCategory[catId] = { name: cat?.name || t('common.uncategorized'), amount: 0 };
      }
      byCategory[catId].amount += e.amount;
    }
    const expensesByCategory = Object.values(byCategory)
      .sort((a, b) => b.amount - a.amount)
      .map((c) => ({
        ...c,
        percentage: totalSpent > 0 ? (c.amount / totalSpent) * 100 : 0,
      }));

    return { totalSpent, expensesByCategory };
  }, [id, expenses, getCategoryById, t]);

  if (!project) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Project' }} />
        <Text style={styles.notFound}>Project not found</Text>
      </SafeAreaView>
    );
  }

  const handleArchive = () => {
    updateProject(project.id, { isArchived: !project.isArchived });
  };

  const handleDelete = () => {
    Alert.alert(
      t('common.delete'),
      t('projects.confirmDelete'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteProject(project.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
              <TouchableOpacity onPress={handleArchive}>
                <Ionicons
                  name={project.isArchived ? 'archive' : 'archive-outline'}
                  size={22}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Project header */}
        <View style={[styles.header, { borderLeftColor: project.color || theme.colors.primary }]}>
          {project.description ? (
            <Text style={styles.description}>{project.description}</Text>
          ) : null}
          {project.budget ? (
            <Text style={styles.budget}>
              {t('projects.budget')}: {project.currencyCode || ''} {Number(project.budget).toFixed(2)}
            </Text>
          ) : null}
          {project.isArchived ? (
            <View style={styles.archivedBadge}>
              <Ionicons name="archive-outline" size={12} color={theme.colors.textTertiary} />
              <Text style={styles.archivedText}>{t('projects.archiveProject')}</Text>
            </View>
          ) : null}
        </View>

        {/* Analytics */}
        {analytics && (
          <View style={styles.analyticsCard}>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>{t('projects.totalSpent')}</Text>
                <Text style={[styles.metricValue, { color: theme.colors.danger }]}>
                  {analytics.totalSpent.toFixed(2)}
                </Text>
              </View>
              {project.budget ? (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>{t('projects.budgetRemaining')}</Text>
                  <Text style={[styles.metricValue, { color: theme.colors.primary }]}>
                    {(Number(project.budget) - analytics.totalSpent).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>

            {analytics.expensesByCategory.length > 0 && (
              <View style={styles.categoryBreakdown}>
                <Text style={styles.breakdownTitle}>{t('analytics.spendingByCategory')}</Text>
                {analytics.expensesByCategory.map((cat, idx) => (
                  <View key={idx} style={styles.categoryRow}>
                    <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                    <Text style={styles.categoryAmount}>{cat.amount.toFixed(2)}</Text>
                    <Text style={styles.categoryPct}>{cat.percentage.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4] },
  notFound: {
    textAlign: 'center' as const,
    marginTop: theme.spacing[12],
    color: theme.colors.textTertiary,
    fontSize: 16,
  },
  header: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    marginBottom: theme.spacing[4],
  },
  description: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  budget: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.primary },
  archivedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: theme.spacing[2],
  },
  archivedText: { fontSize: 12, color: theme.colors.textTertiary },
  analyticsCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
  },
  metricRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  metric: { flex: 1, alignItems: 'center' as const },
  metricLabel: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '700' as const, color: theme.colors.textPrimary },
  categoryBreakdown: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[3],
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  categoryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
  },
  categoryName: { flex: 1, fontSize: 13, color: theme.colors.textPrimary },
  categoryAmount: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing[2],
  },
  categoryPct: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    width: 40,
    textAlign: 'right' as const,
  },
});
