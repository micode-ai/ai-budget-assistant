import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';
import { storedCategoryLabel } from '@/features/categories/storedCategoryLabel';
import type { MerchantRuleReapplyPreview } from '@budget/shared-types';

/** Stable accessible-name id for the desktop dialog's `aria-labelledby`; only one sheet is open at a time. */
const TITLE_ID = 'merchant-reapply-sheet-title';

interface Props {
  preview: MerchantRuleReapplyPreview | null;
  selected: Set<string>;
  selectedCount: number;
  saving: boolean;
  onToggleGroup: (categoryId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/** Preview of past expenses a merchant rule would recategorize. State lives in `useMerchantRuleReapply`. */
export function ReapplyMerchantRuleModal({
  preview, selected, selectedCount, saving, onToggleGroup, onClose, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SheetDialog
      visible={preview !== null}
      onClose={onClose}
      titleId={TITLE_ID}
      padBottom={theme.spacing[4]}
      insetFloor={theme.spacing[6]}
      scrimColor="rgba(0,0,0,0.4)"
    >
      {preview && (
        <>
          <Text nativeID={TITLE_ID} style={styles.modalTitle}>
            {t('merchants.reapplyTitle', {
              merchant: preview.merchantNormalized,
              category: preview.targetCategoryName,
            })}
          </Text>
          {preview.groups.map((g) => {
            const isChecked = selected.has(g.categoryId);
            return (
              <TouchableOpacity
                key={g.categoryId}
                style={styles.row}
                onPress={() => onToggleGroup(g.categoryId)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isChecked ? theme.colors.primary : theme.colors.textTertiary}
                />
                <View style={styles.nameContainer}>
                  <Text style={styles.name} numberOfLines={1}>
                    {t('merchants.reapplyGroupLabel', { count: g.count, category: storedCategoryLabel(g.categoryId, g.categoryName) })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.summary}>
            {t('merchants.reapplySummary', { count: selectedCount, category: preview.targetCategoryName })}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, (saving || selectedCount === 0) && styles.saveButtonDisabled]}
              onPress={onConfirm}
              disabled={saving || selectedCount === 0}
            >
              <Text style={styles.saveText}>{t('merchants.reapplyApply', { count: selectedCount })}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  summary: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: theme.spacing[4] },
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
