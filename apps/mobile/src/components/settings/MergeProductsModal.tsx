import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useTheme, useStyles, type Theme } from '@/theme';

interface MergeProductsModalProps {
  visible: boolean;
  mergeLabel: string;
  mergeName: string;
  onChangeName: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bottomInset: number;
}

export function MergeProductsModal({
  visible,
  mergeLabel,
  mergeName,
  onChangeName,
  saving,
  onClose,
  onConfirm,
  bottomInset,
}: MergeProductsModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 24) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{t('priceHistory.mergeProducts')}</Text>
          <Text style={styles.modalSub} numberOfLines={2}>{mergeLabel}</Text>
          <Text style={styles.fieldLabel}>{t('priceHistory.mergeInto')}</Text>
          <TextInput
            style={styles.input}
            value={mergeName}
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
              onPress={onConfirm}
              disabled={saving}
            >
              <Text style={styles.saveText}>{t('priceHistory.mergeProducts')}</Text>
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
  fieldLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
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
});
