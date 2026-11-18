import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';

/** Stable accessible-name id for the desktop dialog's `aria-labelledby`; only one sheet is open at a time. */
const TITLE_ID = 'merchant-rename-sheet-title';

interface Props {
  editing: string | null;
  name: string;
  onChangeName: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

/** Renaming one merchant. State lives in `useMerchantRename`. */
export function RenameMerchantModal({ editing, name, onChangeName, saving, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SheetDialog
      visible={editing !== null}
      onClose={onClose}
      titleId={TITLE_ID}
      keyboardAvoiding
      padBottom={theme.spacing[4]}
      insetFloor={theme.spacing[6]}
      scrimColor="rgba(0,0,0,0.4)"
    >
      <Text nativeID={TITLE_ID} style={styles.modalTitle}>{t('merchants.renameTitle')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onChangeName}
        placeholder={t('merchants.renamePlaceholder')}
        placeholderTextColor={theme.colors.textTertiary}
        autoFocus
        autoCapitalize="words"
      />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16, color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
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
