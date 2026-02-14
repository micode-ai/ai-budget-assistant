import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../src/stores/projectStore';

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const { loadProjects, getActiveProjects, getArchivedProjects } = useProjectStore();

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = getActiveProjects();
  const archived = getArchivedProjects();

  const renderProject = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/projects/${item.id}`)}
    >
      <View style={[styles.colorBar, { backgroundColor: item.color || '#6366F1' }]} />
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.projectDesc} numberOfLines={1}>{item.description}</Text>
        )}
        {item.budget && (
          <Text style={styles.projectBudget}>
            {t('projects.budget') || 'Budget'}: {item.currencyCode || ''} {Number(item.budget).toFixed(2)}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: t('projects.title') || 'Projects',
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/projects/new')} style={{ marginRight: 16 }}>
              <Ionicons name="add-circle" size={28} color="#6366F1" />
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={[...active, ...archived]}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          active.length > 0 ? (
            <Text style={styles.sectionTitle}>{t('projects.activeProjects') || 'Active Projects'}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>{t('projects.noProjects') || 'No projects yet'}</Text>
            <TouchableOpacity
              onPress={() => router.push('/projects/new')}
              style={styles.emptyBtn}
            >
              <Text style={styles.emptyBtnText}>{t('projects.createProject') || 'Create Project'}</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  colorBar: { width: 4, alignSelf: 'stretch' },
  projectInfo: { flex: 1, padding: 12 },
  projectName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  projectDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  projectBudget: { fontSize: 12, color: '#6366F1', marginTop: 4, fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 16, color: '#9CA3AF' },
  emptyBtn: {
    backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
});
