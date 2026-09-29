import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ShoppingItemPriceHint, ShoppingListItem } from '@budget/shared-types';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { api } from '@/services/api';
import { lineTotal, parsePriceInput } from '@/features/shopping-list/listTotals';
import { priceTagToFields } from '@/features/shopping-list/priceTag';
import { usePriceTagScan, type PriceTagSource } from '@/features/shopping-list/usePriceTagScan';
import { useTheme, useStyles, type Theme } from '@/theme';

/** Which sheet is open: a new item, or an existing one. null hides it. */
export type ItemEditState =
  | { mode: 'create'; autoScan?: PriceTagSource }
  | { mode: 'edit'; item: ShoppingListItem }
  | null;

export interface ItemEditPatch {
  rawLabel?: string;
  unitPrice?: number | null;
  note?: string | null;
}

interface ItemEditModalProps {
  state: ItemEditState;
  currency: string;
  onCreate: (fields: { rawLabel: string; unitPrice: number | null; note: string | null }) => void;
  onUpdate: (itemId: string, patch: ItemEditPatch) => void;
  onClose: () => void;
  bottomInset: number;
}

/**
 * Bottom sheet for a shopping-list item's name, price per unit and note — for a
 * new item or an existing one. "Scan price tag" photographs a shelf tag and
 * fills all three fields for the user to confirm (nothing is saved until Save).
 * For a product already bought and scanned on a receipt, an unpriced item also
 * gets a one-tap "last paid" hint. Offline, neither appears; typing still works.
 */
export function ItemEditModal({ state, currency, onCreate, onUpdate, onClose, bottomInset }: ItemEditModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { scan, isScanning } = usePriceTagScan();

  const item = state?.mode === 'edit' ? state.item : null;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState<ShoppingItemPriceHint | null>(null);

  const runScan = async (source: PriceTagSource) => {
    const tag = await scan(source);
    if (!tag) return;
    const fields = priceTagToFields(
      tag,
      currency,
      {
        regular: (p) => t('shoppingList.tagRegular', { price: p }),
        promoUntil: (d) => t('shoppingList.tagPromoUntil', { date: d }),
        loyaltyCard: t('shoppingList.tagLoyaltyCard'),
        foreignPrice: (p) => t('shoppingList.tagForeignPrice', { price: p }),
      },
      formatCurrency,
    );
    if (fields.name) setName(fields.name);
    if (fields.unitPrice != null) setPrice(String(fields.unitPrice));
    if (fields.note) {
      // A note the user already wrote is kept; the tag's details are appended.
      setNote((prev) => (prev.trim() && !prev.includes(fields.note!) ? `${prev.trim()} · ${fields.note}` : fields.note!));
    }
  };

  const stateKey = state ? (state.mode === 'edit' ? `edit:${state.item.id}` : 'create') : null;
  useEffect(() => {
    setName(item?.rawLabel ?? '');
    setPrice(item?.unitPrice != null ? String(item.unitPrice) : '');
    setNote(item?.note ?? '');
    setHint(null);
    if (state?.mode === 'create' && state.autoScan) {
      runScan(state.autoScan);
      return;
    }
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
    // Keyed on which item is open, not the object: a background pull-merge hands
    // the screen a fresh item object and must not wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  const parsedPrice = parsePriceInput(price);
  const priceValid = parsedPrice !== undefined;
  const canSave = priceValid && name.trim().length > 0 && !isScanning;
  const quantity = item?.quantity ?? 1;
  const preview =
    typeof parsedPrice === 'number' && quantity !== 1 ? lineTotal({ unitPrice: parsedPrice, quantity }) : null;

  const handleSave = () => {
    if (!state || !canSave || parsedPrice === undefined) return;
    const trimmedName = name.trim();
    const trimmedNote = note.trim() || null;
    if (state.mode === 'create') {
      onCreate({ rawLabel: trimmedName, unitPrice: parsedPrice, note: trimmedNote });
    } else {
      const patch: ItemEditPatch = {};
      if (trimmedName !== state.item.rawLabel) patch.rawLabel = trimmedName;
      if (parsedPrice !== state.item.unitPrice) patch.unitPrice = parsedPrice;
      if (trimmedNote !== (state.item.note ?? null)) patch.note = trimmedNote;
      if (Object.keys(patch).length > 0) onUpdate(state.item.id, patch);
    }
    onClose();
  };

  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 24) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>
            {t(state?.mode === 'create' ? 'shoppingList.newItemTitle' : 'shoppingList.editItemTitle')}
          </Text>

          <View style={styles.scanRow}>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => runScan('camera')}
              disabled={isScanning}
              accessibilityRole="button"
            >
              {isScanning ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="scan-outline" size={18} color={theme.colors.primary} />
              )}
              <Text style={styles.scanBtnText} numberOfLines={1}>
                {t(isScanning ? 'shoppingList.scanningTag' : 'shoppingList.scanTag')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => runScan('gallery')}
              disabled={isScanning}
              accessibilityRole="button"
              accessibilityLabel={t('shoppingList.scanTagFromGallery')}
            >
              <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>{t('shoppingList.itemName')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('shoppingList.itemNamePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="sentences"
          />

          <Text style={styles.fieldLabel}>{t('shoppingList.priceTitle')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={setPrice}
              placeholder={t('shoppingList.pricePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus={state?.mode === 'edit'}
              accessibilityLabel={t('shoppingList.priceTitle')}
            />
            <Text style={styles.currency}>{currency}</Text>
          </View>
          {!priceValid && <Text style={styles.error}>{t('shoppingList.priceInvalid')}</Text>}
          {preview != null && (
            <Text style={styles.preview}>
              {t('shoppingList.priceLinePreview', { qty: quantity, total: formatCurrency(preview, currency) })}
            </Text>
          )}
          {hint && price.trim() === '' && (
            <TouchableOpacity
              style={styles.hintChip}
              onPress={() => setPrice(String(hint.unitPrice))}
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

          <Text style={styles.fieldLabel}>{t('shoppingList.itemNote')}</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder={t('shoppingList.itemNotePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
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
  scanRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  scanBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  scanBtnText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary, flexShrink: 1 },
  galleryBtn: {
    width: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  input: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  noteInput: { minHeight: 48, maxHeight: 96, textAlignVertical: 'top' as const },
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
    marginBottom: theme.spacing[3],
  },
  hintText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '500' as const },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
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
