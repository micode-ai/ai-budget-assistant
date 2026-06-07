import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '../stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#F7DC6F', '#82E0AA',
  '#D4A574', '#BB8FCE', '#F1948A', '#AED6F1',
];

interface CreateCategoryModalProps {
  visible: boolean;
  type: 'expense' | 'income';
  onClose: () => void;
  onCreated: (categoryId: string) => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  visible,
  type,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { createCategory } = useCategoryStore();

  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert(t('common.error'), t('categoryCreate.nameRequired'));
      return;
    }

    setIsCreating(true);
    try {
      const category = await createCategory(trimmed, type, undefined, selectedColor);
      setName('');
      setSelectedColor(PRESET_COLORS[0]);
      onCreated(category.id);
    } catch {
      showAlert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('categoryCreate.title')}</Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('categoryCreate.namePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus
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
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={isCreating}
            >
              <Text style={styles.createText}>
                {isCreating ? t('categoryCreate.creating') : t('categoryCreate.create')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  colorGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[6],
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
  },
  createButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
