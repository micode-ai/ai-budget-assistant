import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProductListItem } from '@budget/shared-types';

interface RenameProductModalProps {
  editing: ProductListItem | null;
  renameName: string;
  onChangeName: (value: string) => void;
  saving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: () => void;
  onIgnore: (item: ProductListItem) => void;
  bottomInset: number;
}

export function RenameProductModal({
  editing,
  renameName,
  onChangeName,
  saving,
  canEdit,
  onClose,
  onSave,
  onIgnore,
  bottomInset,
}: RenameProductModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 24) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{t('priceHistory.renameProduct')}</Text>
          {editing?.rawName !== editing?.canonicalName && (
            <Text style={styles.modalSub}>{editing?.rawName}</Text>
          )}
          <TextInput
            style={styles.input}
            value={renameName}
            onChangeText={onChangeName}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus
            autoCapitalize="words"
          />
          <View style={styles.rowActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.saveText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
          {canEdit && editing && (
            <TouchableOpacity style={styles.ignoreBtn} onPress={() => onIgnore(editing)}>
              <Ionicons name="eye-off-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.ignoreBtnText}>{t('priceHistory.ignoreProduct')}</Text>
            </TouchableOpacity>
          )}
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
    gap: theme.spacing[3],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  modalSub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  rowActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  ignoreBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginTop: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  ignoreBtnText: { fontSize: 14, color: theme.colors.danger },
});
