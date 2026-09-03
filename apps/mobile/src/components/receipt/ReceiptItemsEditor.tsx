import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { parseAmount } from '@/utils/amount';
import type { ReceiptItem } from '@/features/receipt/useReceiptScanner';

type EditableItemFields = Pick<ReceiptItem, 'description' | 'quantity' | 'unitPrice' | 'totalPrice'>;

interface Props {
  items: ReceiptItem[];
  currencyCode: string;
  onEditItem: (index: number, patch: Partial<EditableItemFields>) => void;
  onAddItem: (item: EditableItemFields) => void;
  onRemoveItem: (index: number) => void;
}

interface DraftFields {
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

const EMPTY_DRAFT: DraftFields = { description: '', quantity: '', unitPrice: '', totalPrice: '' };

function toDraft(item: ReceiptItem): DraftFields {
  return {
    description: item.description,
    quantity: item.quantity != null ? String(item.quantity) : '',
    unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
    totalPrice: String(item.totalPrice),
  };
}

/**
 * Editable replacement for `ReceiptConfirmCard`'s former static, 5-item-capped
 * list (ABA receipt-line-item-editing) — every line renders, each row
 * expands in place into description/quantity/unit-price/total-price inputs
 * (mirrors `ItemCategorySheet`'s expand-on-tap pattern, not a separate modal
 * — items are core to the confirm card), plus a trash icon per row and a
 * trailing "+ Add item" row.
 *
 * Purely presentational: the only state here is "which row is expanded" and
 * its in-progress edit buffer. Every committed change goes back through the
 * three callback props — `useReceiptCategorySplit` owns the real items array,
 * the itemCategories reindex-on-delete, and split recomputation.
 */
export default function ReceiptItemsEditor({ items, currencyCode, onEditItem, onAddItem, onRemoveItem }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState(false);

  const closeEditors = () => {
    setExpandedIndex(null);
    setIsAdding(false);
    setDraft(EMPTY_DRAFT);
    setDraftError(false);
  };

  const startEdit = (index: number, item: ReceiptItem) => {
    setIsAdding(false);
    setExpandedIndex(index);
    setDraft(toDraft(item));
    setDraftError(false);
  };

  const startAdd = () => {
    setExpandedIndex(null);
    setIsAdding(true);
    setDraft(EMPTY_DRAFT);
    setDraftError(false);
  };

  const commitDraft = () => {
    const description = draft.description.trim();
    const totalPrice = parseAmount(draft.totalPrice);
    if (!description || !Number.isFinite(totalPrice) || totalPrice <= 0) {
      setDraftError(true);
      return;
    }
    const quantity = draft.quantity.trim() ? parseAmount(draft.quantity) : NaN;
    const unitPrice = draft.unitPrice.trim() ? parseAmount(draft.unitPrice) : NaN;
    const patch: EditableItemFields = {
      description,
      totalPrice,
      quantity: Number.isFinite(quantity) ? quantity : undefined,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
    };
    if (isAdding) {
      onAddItem(patch);
    } else if (expandedIndex != null) {
      onEditItem(expandedIndex, patch);
    }
    closeEditors();
  };

  const renderDraftForm = () => (
    <View style={styles.editForm}>
      <TextInput
        style={styles.input}
        value={draft.description}
        onChangeText={(text) => setDraft((d) => ({ ...d, description: text }))}
        placeholder={t('receipt.itemDescriptionPlaceholder')}
        placeholderTextColor={theme.colors.textDisabled}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputThird]}
          value={draft.quantity}
          onChangeText={(text) => setDraft((d) => ({ ...d, quantity: text }))}
          placeholder={t('receipt.itemQuantity')}
          placeholderTextColor={theme.colors.textDisabled}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, styles.inputThird]}
          value={draft.unitPrice}
          onChangeText={(text) => setDraft((d) => ({ ...d, unitPrice: text }))}
          placeholder={t('receipt.itemUnitPrice')}
          placeholderTextColor={theme.colors.textDisabled}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, styles.inputThird]}
          value={draft.totalPrice}
          onChangeText={(text) => setDraft((d) => ({ ...d, totalPrice: text }))}
          placeholder={t('receipt.itemTotalPrice')}
          placeholderTextColor={theme.colors.textDisabled}
          keyboardType="decimal-pad"
        />
      </View>
      {draftError && <Text style={styles.errorText}>{t('receipt.itemRequiredError')}</Text>}
      <View style={styles.editActions}>
        <TouchableOpacity style={styles.editActionButton} onPress={closeEditors}>
          <Text style={styles.editActionCancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.editActionButton, styles.editActionSave]} onPress={commitDraft}>
          <Text style={styles.editActionSaveText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (items.length === 0 && !isAdding) {
    return (
      <View style={styles.itemsSection}>
        <TouchableOpacity style={styles.addItemRow} onPress={startAdd} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.addItemText}>{t('receipt.addItem')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.itemsSection}>
      <Text style={styles.itemsTitle}>{t('receipt.items', { count: items.length })}</Text>
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index;
        return (
          <View key={index}>
            <View style={styles.itemRow}>
              <TouchableOpacity
                style={styles.itemRowMain}
                onPress={() => (isExpanded ? closeEditors() : startEdit(index, item))}
                activeOpacity={0.7}
              >
                <Text style={styles.itemDescription} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(item.totalPrice, (currencyCode || 'USD') as Currency)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onRemoveItem(index)}
                style={styles.deleteButton}
                accessibilityLabel={t('receipt.removeItemA11y')}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
            {isExpanded && renderDraftForm()}
          </View>
        );
      })}

      {isAdding ? (
        renderDraftForm()
      ) : (
        <TouchableOpacity style={styles.addItemRow} onPress={startAdd} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.addItemText}>{t('receipt.addItem')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  itemsSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    width: '100%' as const,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
    gap: theme.spacing[2],
  },
  itemRowMain: {
    flex: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  itemDescription: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  itemPrice: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  deleteButton: {
    padding: theme.spacing[1],
  },
  editForm: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  inputThird: {
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.danger,
  },
  editActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  editActionButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.sm,
  },
  editActionSave: {
    backgroundColor: theme.colors.primary,
  },
  editActionCancelText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  editActionSaveText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  addItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  addItemText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
