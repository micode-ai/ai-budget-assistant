import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { loadProjects, getActiveProjects, getArchivedProjects } = useProjectStore();

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = getActiveProjects();
  const archived = getArchivedProjects();
  const all = [...active, ...archived];

  const renderProject = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/projects/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.colorBar, { backgroundColor: item.color || theme.colors.primary }]} />
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.projectDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        {item.budget ? (
          <Text style={styles.projectBudget}>
            {t('projects.budget')}: {item.currencyCode || ''} {Number(item.budget).toFixed(2)}
          </Text>
        ) : null}
      </View>
      {item.isArchived ? (
        <Ionicons name="archive-outline" size={16} color={theme.colors.textTertiary} style={{ marginRight: 4 }} />
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('projects.title'),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/projects/new')} style={{ marginRight: 16 }}>
              <Ionicons name="add-circle" size={28} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={all}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          active.length > 0 && archived.length > 0 ? (
            <Text style={styles.sectionTitle}>{t('projects.activeProjects')}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={theme.colors.textDisabled} />
            <Text style={styles.emptyText}>{t('projects.noProjects')}</Text>
            <TouchableOpacity onPress={() => router.push('/projects/new')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>{t('projects.createProject')}</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  list: { padding: theme.spacing[4] },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  projectCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[2],
    overflow: 'hidden' as const,
  },
  colorBar: { width: 4, alignSelf: 'stretch' as const },
  projectInfo: { flex: 1, padding: theme.spacing[3] },
  projectName: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
  projectDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  projectBudget: {
    fontSize: 12,
    color: theme.colors.primary,
    marginTop: 4,
    fontWeight: '500' as const,
  },
  empty: { alignItems: 'center' as const, paddingTop: theme.spacing[12], gap: theme.spacing[3] },
  emptyText: { fontSize: 16, color: theme.colors.textTertiary },
  emptyBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing[2],
  },
  emptyBtnText: { color: theme.colors.textInverse, fontWeight: '600' as const },
});
