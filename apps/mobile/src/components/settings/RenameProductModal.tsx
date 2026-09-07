import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProductListItem } from '@budget/shared-types';

/**
 * Stable accessible-name id for this sheet's title, wired to the desktop
 * dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `ExpenseDialog.tsx`'s is: only one instance is ever mounted at a time.
 */
const TITLE_ID = 'product-rename-sheet-title';

interface RenameProductModalProps {
  editing: ProductListItem | null;
  renameName: string;
  onChangeName: (value: string) => void;
  saving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: () => void;
  onIgnore: (item: ProductListItem) => void;
}

/**
 * Renaming one tracked product.
 *
 * The chrome — bottom sheet on a phone, centred dialog on desktop web — is
 * `SheetDialog`'s, and so is the bottom inset. The `bottomInset` prop this
 * component used to take from `ProductsSettings` is gone with it: the wrapper
 * reads the safe area itself, which is the whole point of having one.
 */
export function RenameProductModal({
  editing,
  renameName,
  onChangeName,
  saving,
  canEdit,
  onClose,
  onSave,
  onIgnore,
}: RenameProductModalProps) {
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
      sheetStyle={styles.sheetBox}
      desktopContentStyle={styles.sheetBox}
    >
      <Text nativeID={TITLE_ID} style={styles.modalTitle}>{t('priceHistory.renameProduct')}</Text>
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
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  // The one deviation from `SheetDialog`'s canonical sheet box: this form
  // spaces its rows with a `gap` rather than margins. Passed to the desktop
  // panel's content container too, or the fields sit flush there.
  sheetBox: { gap: theme.spacing[3] },
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
