import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ExpenseItem } from '@budget/shared-types';

interface ExpenseItemsSectionProps {
  expenseId: string;
  currencyCode: string;
}

export function ExpenseItemsSection({ expenseId, currencyCode }: ExpenseItemsSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { expenseItems, loadExpenseItems, addExpenseItem, updateExpenseItem, deleteExpenseItem } =
    useExpenseStore();

  const items = expenseItems[expenseId] || [];

  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnitPrice, setItemUnitPrice] = useState('0');
  const [itemTotalPrice, setItemTotalPrice] = useState('0');

  useEffect(() => {
    loadExpenseItems(expenseId);
  }, [expenseId]);

  const openAddItem = () => {
    setEditingItem(null);
    setItemDescription('');
    setItemQuantity('1');
    setItemUnitPrice('0');
    setItemTotalPrice('0');
    setItemModalVisible(true);
  };

  const openEditItem = (item: ExpenseItem) => {
    setEditingItem(item);
    setItemDescription(item.description);
    setItemQuantity(item.quantity.toString());
    setItemUnitPrice(item.unitPrice.toString());
    setItemTotalPrice(item.totalPrice.toString());
    setItemModalVisible(true);
  };

  const handleSaveItem = () => {
    const total = parseAmount(itemTotalPrice);
    if (!itemDescription.trim() || isNaN(total) || total <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (editingItem) {
      updateExpenseItem(expenseId, editingItem.id, {
        description: itemDescription.trim(),
        quantity: parseAmount(itemQuantity) || 1,
        unitPrice: parseAmount(itemUnitPrice) || 0,
        totalPrice: total,
      });
    } else {
      addExpenseItem(expenseId, {
        description: itemDescription.trim(),
        quantity: parseAmount(itemQuantity) || 1,
        unitPrice: parseAmount(itemUnitPrice) || 0,
        totalPrice: total,
        sortOrder: items.length,
      });
    }
    setItemModalVisible(false);
  };

  const handleDeleteItem = (item: ExpenseItem) => {
    showAlert(t('expenseDetail.confirmDeleteItem'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteExpenseItem(expenseId, item.id),
      },
    ]);
  };

  return (
    <>
      <View style={styles.itemsCard}>
        <View style={styles.itemsHeader}>
          <Text style={styles.itemsTitle}>{t('expenseDetail.receiptItems')}</Text>
          <TouchableOpacity onPress={openAddItem} style={styles.addItemButton}>
            <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <Text style={styles.noItemsText}>{t('expenseDetail.noItems')}</Text>
        ) : (
          items.filter((i) => !i.isDeleted).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.itemMeta}>
                  {item.quantity} x {formatCurrency(item.unitPrice, currencyCode)}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemTotal}>{formatCurrency(item.totalPrice, currencyCode)}</Text>
                <View style={styles.itemButtons}>
                  <TouchableOpacity onPress={() => openEditItem(item)} style={styles.itemIconBtn}>
                    <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteItem(item)} style={styles.itemIconBtn}>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={itemModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingItem ? t('expenseDetail.editItem') : t('expenseDetail.addItem')}
            </Text>

            <Text style={styles.modalLabel}>{t('expenseDetail.itemDescription')}</Text>
            <TextInput
              style={styles.modalInput}
              value={itemDescription}
              onChangeText={setItemDescription}
              placeholder={t('expenseDetail.itemDescription')}
            />

            <View style={styles.modalRow}>
              <View style={styles.modalHalf}>
                <Text style={styles.modalLabel}>{t('expenseDetail.itemQuantity')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={itemQuantity}
                  onChangeText={setItemQuantity}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.modalHalf}>
                <Text style={styles.modalLabel}>{t('expenseDetail.itemUnitPrice')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={itemUnitPrice}
                  onChangeText={setItemUnitPrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>{t('expenseDetail.itemTotalPrice')}</Text>
            <TextInput
              style={styles.modalInput}
              value={itemTotalPrice}
              onChangeText={setItemTotalPrice}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveItem}>
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  itemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  itemsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  addItemButton: {
    padding: theme.spacing[1],
  },
  noItemsText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  itemName: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  itemMeta: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  itemActions: {
    alignItems: 'flex-end' as const,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  itemButtons: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  itemIconBtn: {
    padding: theme.spacing[1],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
  },
  modalLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3.5],
  },
  modalRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  modalHalf: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.textDisabled,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  modalSave: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
