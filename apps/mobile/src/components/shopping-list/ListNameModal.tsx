import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface NameModalState {
  mode: 'create' | 'rename';
  id?: string;
  value: string;
}

interface ListNameModalProps {
  nameModal: NameModalState | null;
  onChangeValue: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  bottomInset: number;
}

export function ListNameModal({
  nameModal,
  onChangeValue,
  onSave,
  onClose,
  bottomInset,
}: ListNameModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={nameModal !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 24) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>
            {nameModal?.mode === 'create' ? t('shoppingList.newList') : t('shoppingList.renameList')}
          </Text>
          <TextInput
            style={styles.nameInput}
            value={nameModal?.value ?? ''}
            onChangeText={onChangeValue}
            placeholder={t('shoppingList.listName')}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={onSave}
          />
          <View style={styles.nameModalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !nameModal?.value.trim() && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={!nameModal?.value.trim()}
            >
              <Text style={styles.saveText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },

  nameInput: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  nameModalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  cancelText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
  saveBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
