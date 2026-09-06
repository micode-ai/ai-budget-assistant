import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Stable accessible-name id for this sheet's title, wired to the desktop
 * dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `ExpenseDialog.tsx`'s is: only one instance is ever mounted at a time.
 */
const TITLE_ID = 'product-merge-sheet-title';

interface MergeProductsModalProps {
  visible: boolean;
  mergeLabel: string;
  mergeName: string;
  onChangeName: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Merging several tracked products into one.
 *
 * The chrome — bottom sheet on a phone, centred dialog on desktop web — is
 * `SheetDialog`'s, and so is the bottom inset. The `bottomInset` prop this
 * component used to take from `ProductsSettings` is gone with it: the wrapper
 * reads the safe area itself, which is the whole point of having one.
 */
export function MergeProductsModal({
  visible,
  mergeLabel,
  mergeName,
  onChangeName,
  saving,
  onClose,
  onConfirm,
}: MergeProductsModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SheetDialog
      visible={visible}
      onClose={onClose}
      titleId={TITLE_ID}
      keyboardAvoiding
      padBottom={theme.spacing[4]}
      insetFloor={theme.spacing[6]}
      scrimColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheetBox}
      desktopContentStyle={styles.sheetBox}
    >
      <Text nativeID={TITLE_ID} style={styles.modalTitle}>{t('priceHistory.mergeProducts')}</Text>
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
