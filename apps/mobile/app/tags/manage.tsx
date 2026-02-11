import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTagStore } from '../../src/stores/tagStore';
import { TagChip } from '../../src/components/TagChip';

export default function ManageTagsScreen() {
  const { t } = useTranslation();
  const { tags, loadTags, createTag, deleteTag, updateTag } = useTagStore();
  const [newTagName, setNewTagName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    await createTag(newTagName.trim());
    setNewTagName('');
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      t('tags.deleteTag') || 'Delete Tag',
      t('tags.confirmDelete') || `Delete "${name}"?`,
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: () => deleteTag(id),
        },
      ],
    );
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await updateTag(id, { name: editName.trim() });
    setEditingId(null);
  };

  const renderTag = ({ item }: { item: any }) => (
    <View style={styles.tagRow}>
      {editingId === item.id ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.editInput}
            value={editName}
            onChangeText={setEditName}
            autoFocus
            onSubmitEditing={() => handleSaveEdit(item.id)}
          />
          <TouchableOpacity onPress={() => handleSaveEdit(item.id)}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditingId(null)}>
            <Ionicons name="close-circle" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.tagInfo}>
            <TagChip name={item.name} color={item.color} />
            <Text style={styles.usageCount}>
              {item.usageCount || 0} {t('tags.usedInExpenses') || 'uses'}
            </Text>
          </View>
          <View style={styles.tagActions}>
            <TouchableOpacity
              onPress={() => {
                setEditingId(item.id);
                setEditName(item.name);
              }}
            >
              <Ionicons name="pencil" size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: t('tags.manageTags') || 'Manage Tags' }} />

      <View style={styles.createRow}>
        <TextInput
          style={styles.createInput}
          placeholder={t('tags.tagName') || 'New tag name...'}
          value={newTagName}
          onChangeText={setNewTagName}
          onSubmitEditing={handleCreate}
        />
        <TouchableOpacity onPress={handleCreate} style={styles.createBtn}>
          <Ionicons name="add-circle" size={32} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tags}
        renderItem={renderTag}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>{t('tags.noTags') || 'No tags yet'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  createInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginRight: 12,
    color: '#111827',
  },
  createBtn: {
    padding: 4,
  },
  list: {
    padding: 16,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  tagInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usageCount: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  tagActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    color: '#111827',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
