import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ShoppingItemPriceHint, ShoppingListItem } from '@budget/shared-types';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { api } from '@/services/api';
import { lineTotal, parsePriceInput } from '@/features/shopping-list/listTotals';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ItemPriceModalProps {
  /** The item being priced; null hides the sheet. */
  item: ShoppingListItem | null;
  currency: string;
  onSave: (itemId: string, unitPrice: number | null) => void;
  onClose: () => void;
  bottomInset: number;
}

/**
 * Bottom sheet for typing a shopping-list item's price per unit. For a product
 * the user has bought before (it has a canonicalName) and that has no price yet,
 * it fetches the last price from a scanned receipt and offers it as a one-tap
 * fill. Offline, the hint silently doesn't appear — the field works regardless.
 */
export function ItemPriceModal({ item, currency, onSave, onClose, bottomInset }: ItemPriceModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [value, setValue] = useState('');
  const [hint, setHint] = useState<ShoppingItemPriceHint | null>(null);

  useEffect(() => {
    setValue(item?.unitPrice != null ? String(item.unitPrice) : '');
    setHint(null);
    if (!item || item.unitPrice != null || !item.canonicalName) return;
    let cancelled = false;
    api
      .getItemPriceHint(item.canonicalName)
      .then((h) => {
        if (!cancelled && h) setHint(h);
      })
      .catch((e) => console.warn('Shopping list price hint unavailable (offline?):', e));
    return () => {
      cancelled = true;
    };
    // Keyed on the id, not the object: a background pull-merge hands the screen
    // a fresh item object and must not wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const parsed = parsePriceInput(value);
  const isValid = parsed !== undefined;
  const preview =
    item && typeof parsed === 'number' && item.quantity !== 1
      ? lineTotal({ unitPrice: parsed, quantity: item.quantity })
      : null;

  const handleSave = () => {
    if (!item || !isValid) return;
    onSave(item.id, parsed);
    onClose();
  };

  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 24) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{t('shoppingList.priceTitle')}</Text>
          <Text style={styles.itemName} numberOfLines={2}>
            {item?.rawLabel}
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.priceInput}
              value={value}
              onChangeText={setValue}
              placeholder={t('shoppingList.pricePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
              accessibilityLabel={t('shoppingList.priceTitle')}
            />
            <Text style={styles.currency}>{currency}</Text>
          </View>

          {!isValid && <Text style={styles.error}>{t('shoppingList.priceInvalid')}</Text>}
          {preview != null && (
            <Text style={styles.preview}>
              {t('shoppingList.priceLinePreview', {
                qty: item?.quantity,
                total: formatCurrency(preview, currency),
              })}
            </Text>
          )}

          {hint && value.trim() === '' && (
            <TouchableOpacity
              style={styles.hintChip}
              onPress={() => setValue(String(hint.unitPrice))}
              accessibilityRole="button"
            >
              <Text style={styles.hintText} numberOfLines={2}>
                {hint.merchant
                  ? t('shoppingList.priceHintAt', {
                      price: formatCurrency(hint.unitPrice, currency),
                      merchant: hint.merchant,
                    })
                  : t('shoppingList.priceHint', { price: formatCurrency(hint.unitPrice, currency) })}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!isValid}
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
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  itemName: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  priceInput: {
    ...theme.textStyles.body,
    flex: 1,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing[3],
  },
  currency: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  error: { ...theme.textStyles.bodySm, color: theme.colors.danger, marginBottom: theme.spacing[2] },
  preview: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  hintChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  hintText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '500' as const },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
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
