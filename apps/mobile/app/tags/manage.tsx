import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTagStore } from '@/stores/tagStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Tag } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#F7DC6F', '#82E0AA',
  '#D4A574', '#BB8FCE', '#F1948A', '#AED6F1',
];

export default function ManageTagsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());
  const { tags, loadTags, createTag, deleteTag, updateTag } = useTagStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingTag(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setName(tag.name);
    setSelectedColor(tag.color || PRESET_COLORS[0]);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTag(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      if (editingTag) {
        await updateTag(editingTag.id, { name: trimmed, color: selectedColor });
      } else {
        await createTag(trimmed);
      }
      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (tag: Tag) => {
    Alert.alert(t('tags.deleteTag'), t('tags.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteTag(tag.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('tags.manageTags') }} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Section header — same as categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('tags.manageTags')}</Text>
          {canEdit && (
            <TouchableOpacity onPress={openCreate} hitSlop={8}>
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          {tags.length === 0 ? (
            <Text style={styles.empty}>{t('tags.noTags')}</Text>
          ) : (
            tags.map((tag, i) => (
              <React.Fragment key={tag.id}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={canEdit ? () => openEdit(tag) : undefined}
                    activeOpacity={canEdit ? 0.7 : 1}
                  >
                    <View style={[styles.colorDot, { backgroundColor: tag.color || theme.colors.textTertiary }]} />
                    <View style={styles.nameContainer}>
                      <Text style={styles.name}>{tag.name}</Text>
                      <Text style={styles.sub}>
                        {t('tags.usedInExpenses', { count: tag.usageCount || 0 })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {canEdit && (
                    <TouchableOpacity onPress={() => handleDelete(tag)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
                {i < tags.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>
              {editingTag ? t('tags.editTag') : t('tags.addTag')}
            </Text>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('tags.tagName')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
              maxLength={50}
            />

            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
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
                onPress={handleSave}
                disabled={isSaving || !name.trim()}
              >
                <Text style={styles.saveText}>
                  {editingTag ? t('common.save') : t('tags.createTag')}
                </Text>
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
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
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
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
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
