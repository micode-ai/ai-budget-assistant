import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../src/stores/projectStore';
import { api } from '../../src/services/api';

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, updateProject, deleteProject } = useProjectStore();
  const project = projects.find(p => p.id === id);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    if (id) {
      api.getProjectAnalytics(id).then(setAnalytics).catch(() => {});
    }
  }, [id]);

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
      t('common.delete') || 'Delete',
      t('projects.confirmDelete') || `Delete "${project.name}"?`,
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
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
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
              <TouchableOpacity onPress={handleArchive}>
                <Ionicons
                  name={project.isArchived ? 'archive' : 'archive-outline'}
                  size={22}
                  color="#6B7280"
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <View style={styles.content}>
        {/* Project header */}
        <View style={[styles.header, { borderLeftColor: project.color || '#6366F1' }]}>
          {project.description && (
            <Text style={styles.description}>{project.description}</Text>
          )}
          {project.budget && (
            <Text style={styles.budget}>
              {t('projects.budget') || 'Budget'}: {project.currencyCode || ''} {Number(project.budget).toFixed(2)}
            </Text>
          )}
        </View>

        {/* Analytics summary */}
        {analytics && (
          <View style={styles.analyticsCard}>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>{t('projects.totalSpent') || 'Total Spent'}</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  {analytics.totalExpenses?.toFixed(2) || '0.00'}
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>{t('common.income') || 'Income'}</Text>
                <Text style={[styles.metricValue, { color: '#10B981' }]}>
                  {analytics.totalIncome?.toFixed(2) || '0.00'}
                </Text>
              </View>
              {project.budget && (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>{t('projects.budgetRemaining') || 'Remaining'}</Text>
                  <Text style={[styles.metricValue, { color: '#6366F1' }]}>
                    {analytics.budgetRemaining?.toFixed(2) || '0.00'}
                  </Text>
                </View>
              )}
            </View>

            {/* Category breakdown */}
            {analytics.expensesByCategory?.length > 0 && (
              <View style={styles.categoryBreakdown}>
                <Text style={styles.breakdownTitle}>
                  {t('analytics.spendingByCategory') || 'By Category'}
                </Text>
                {analytics.expensesByCategory.map((cat: any, idx: number) => (
                  <View key={idx} style={styles.categoryRow}>
                    <Text style={styles.categoryName}>{cat.categoryName}</Text>
                    <Text style={styles.categoryAmount}>{cat.amount.toFixed(2)}</Text>
                    <Text style={styles.categoryPct}>{cat.percentage.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  notFound: { textAlign: 'center', marginTop: 48, color: '#9CA3AF', fontSize: 16 },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  description: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  budget: { fontSize: 14, fontWeight: '600', color: '#6366F1' },
  analyticsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metric: { alignItems: 'center' },
  metricLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  categoryBreakdown: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 12 },
  breakdownTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  categoryName: { flex: 1, fontSize: 13, color: '#374151' },
  categoryAmount: { fontSize: 13, fontWeight: '500', color: '#111827', marginRight: 8 },
  categoryPct: { fontSize: 12, color: '#9CA3AF', width: 40, textAlign: 'right' },
});
