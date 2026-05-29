import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTagStore } from '@/stores/tagStore';
import { TagChip } from '@/components/TagChip';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ManageTagsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { tags, loadTags, createTag, deleteTag, updateTag } = useTagStore();
  const [newTagName, setNewTagName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    await createTag(newTagName.trim());
    setNewTagName('');
  };

  const handleDelete = (id: string) => {
    Alert.alert(t('tags.deleteTag'), t('tags.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteTag(id) },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateTag(editingId, { name: editName.trim() });
    setEditingId(null);
  };

  const renderTag = ({ item }: { item: any }) => (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <TagChip name={item.name} color={item.color} />
        <Text style={styles.rowCount}>
          {t('tags.usedInExpenses', { count: item.usageCount || 0 })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => { setEditingId(item.id); setEditName(item.name); }}
        style={styles.rowBtn}
      >
        <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.rowBtn}>
        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('tags.manageTags') }} />

      <View style={styles.createRow}>
        <TextInput
          style={styles.createInput}
          placeholder={t('tags.tagName')}
          placeholderTextColor={theme.colors.textTertiary}
          value={newTagName}
          onChangeText={setNewTagName}
          onSubmitEditing={handleCreate}
        />
        <TouchableOpacity onPress={handleCreate} style={styles.createBtn}>
          <Ionicons name="add-circle" size={32} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tags}
        renderItem={renderTag}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color={theme.colors.textDisabled} />
            <Text style={styles.emptyText}>{t('tags.noTags')}</Text>
          </View>
        }
      />

      <Modal
        visible={editingId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingId(null)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('tags.editTag')}</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('tags.tagName')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditingId(null)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveEdit}>
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
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
  createRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  createInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing[3],
    color: theme.colors.textPrimary,
  },
  createBtn: { padding: theme.spacing[1] },
  list: { padding: theme.spacing[4] },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  rowInfo: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  rowCount: { fontSize: 12, color: theme.colors.textTertiary },
  rowBtn: { padding: theme.spacing[2] },
  empty: { alignItems: 'center' as const, paddingTop: theme.spacing[12], gap: theme.spacing[3] },
  emptyText: { fontSize: 16, color: theme.colors.textTertiary },
  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' as const },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  modalActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  modalCancel: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.textDisabled,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textSecondary },
  modalSave: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  modalSaveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
