import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useProjectStore } from '../stores/projectStore';

interface ProjectPickerProps {
  selectedProjectId?: string | null;
  onProjectChange: (projectId: string | null) => void;
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  selectedProjectId,
  onProjectChange,
}) => {
  const { t } = useTranslation();
  const { projects, deleteProject } = useProjectStore();
  const activeProjects = useMemo(
    () => projects.filter(p => !p.isArchived && !p.isDeleted),
    [projects],
  );

  const handleDeleteProject = (projectId: string, projectName: string) => {
    Alert.alert(
      t('projects.deleteProject') || 'Delete Project',
      t('projects.confirmDelete') || 'Are you sure you want to delete this project?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: () => {
            if (selectedProjectId === projectId) {
              onProjectChange(null);
            }
            deleteProject(projectId);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('projects.addToProject') || 'Add to Project'}</Text>
      {activeProjects.length === 0 ? (
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/projects/new')}
        >
          <Ionicons name="add-circle-outline" size={18} color="#6366F1" />
          <Text style={styles.createBtnText}>{t('projects.createProject') || 'Create Project'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.projectList}>
          {selectedProjectId && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => onProjectChange(null)}
            >
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              <Text style={styles.clearText}>{t('common.clear') || 'Clear'}</Text>
            </TouchableOpacity>
          )}
          {activeProjects.map(project => (
            <TouchableOpacity
              key={project.id}
              style={[
                styles.projectChip,
                selectedProjectId === project.id && {
                  backgroundColor: project.color || '#6366F1',
                  borderColor: project.color || '#6366F1',
                },
              ]}
              onPress={() =>
                onProjectChange(selectedProjectId === project.id ? null : project.id)
              }
              onLongPress={() => handleDeleteProject(project.id, project.name)}
            >
              {project.icon && (
                <Ionicons
                  name={(project.icon as any) || 'folder-outline'}
                  size={14}
                  color={selectedProjectId === project.id ? '#fff' : project.color || '#6366F1'}
                />
              )}
              <Text
                style={[
                  styles.projectText,
                  selectedProjectId === project.id
                    ? styles.projectTextSelected
                    : { color: project.color || '#6366F1' },
                ]}
              >
                {project.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/projects/new')}
          >
            <Ionicons name="add" size={16} color="#6366F1" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  projectList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    marginRight: 8,
    marginBottom: 8,
    gap: 4,
  },
  projectText: {
    fontSize: 13,
    fontWeight: '500',
  },
  projectTextSelected: {
    color: '#fff',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    gap: 4,
  },
  clearText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
    gap: 6,
    alignSelf: 'flex-start',
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6366F1',
  },
  addBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    marginBottom: 8,
  },
});
