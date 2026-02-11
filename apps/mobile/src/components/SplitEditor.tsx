import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '../stores/categoryStore';
import { getCategoryDisplayName } from '../utils/categoryDisplayName';

interface Split {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  notes?: string;
}

interface SplitEditorProps {
  totalAmount: number;
  currencyCode: string;
  initialSplits?: Split[];
  onSplitsChange: (splits: Split[]) => void;
  onCancel: () => void;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  totalAmount,
  currencyCode,
  initialSplits,
  onSplitsChange,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { getExpenseCategories } = useCategoryStore();
  const categories = getExpenseCategories();
  const [splits, setSplits] = useState<Split[]>(
    initialSplits || [],
  );

  const remainingAmount = totalAmount - splits.reduce((sum, s) => sum + s.amount, 0);

  const addSplit = useCallback(() => {
    const usedIds = new Set(splits.map(s => s.categoryId));
    const availableCategory = categories.find(c => !usedIds.has(c.id));
    if (!availableCategory) return;

    const newSplit: Split = {
      categoryId: availableCategory.id,
      categoryName: getCategoryDisplayName(availableCategory, t),
      amount: Math.max(0, remainingAmount),
      percentage: totalAmount > 0 ? Math.max(0, (remainingAmount / totalAmount) * 100) : 0,
    };
    setSplits([...splits, newSplit]);
  }, [splits, categories, remainingAmount, totalAmount]);

  const removeSplit = useCallback((index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  }, [splits]);

  const updateSplitAmount = useCallback((index: number, amountStr: string) => {
    const amount = parseFloat(amountStr) || 0;
    const newSplits = [...splits];
    newSplits[index] = {
      ...newSplits[index],
      amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
    };
    setSplits(newSplits);
  }, [splits, totalAmount]);

  const updateSplitCategory = useCallback((index: number, categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    const newSplits = [...splits];
    newSplits[index] = {
      ...newSplits[index],
      categoryId,
      categoryName: getCategoryDisplayName(category, t),
    };
    setSplits(newSplits);
  }, [splits, categories]);

  const handleConfirm = useCallback(() => {
    const total = splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(total - totalAmount) > 0.01) {
      Alert.alert(
        t('splits.totalMustMatch') || 'Total must match',
        `Split total: ${total.toFixed(2)}, Expense: ${totalAmount.toFixed(2)}`,
      );
      return;
    }
    if (splits.length < 2) {
      Alert.alert('', t('splits.addCategory') || 'Add at least 2 categories');
      return;
    }
    onSplitsChange(splits);
  }, [splits, totalAmount, onSplitsChange, t]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('splits.splitExpense') || 'Split Expense'}</Text>
      <Text style={styles.subtitle}>
        {t('splits.remainingAmount', { amount: `${currencyCode} ${remainingAmount.toFixed(2)}` }) ||
          `Remaining: ${currencyCode} ${remainingAmount.toFixed(2)}`}
      </Text>

      {splits.map((split, index) => (
        <View key={index} style={styles.splitRow}>
          <TouchableOpacity style={styles.categorySelector}>
            <View style={[styles.colorDot, { backgroundColor: categories.find(c => c.id === split.categoryId)?.color || '#6B7280' }]} />
            <Text style={styles.categoryName}>{split.categoryName}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.amountInput}
            value={split.amount > 0 ? split.amount.toString() : ''}
            onChangeText={(text) => updateSplitAmount(index, text)}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />

          <Text style={styles.percentage}>
            {split.percentage.toFixed(0)}%
          </Text>

          <TouchableOpacity onPress={() => removeSplit(index)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ))}

      {splits.length < 10 && (
        <TouchableOpacity onPress={addSplit} style={styles.addBtn}>
          <Ionicons name="add-circle-outline" size={20} color="#6366F1" />
          <Text style={styles.addText}>{t('splits.addCategory') || 'Add Category'}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('common.cancel') || 'Cancel'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleConfirm} style={styles.confirmBtn}>
          <Text style={styles.confirmText}>{t('splits.confirmSplit') || 'Confirm Split'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  categorySelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  amountInput: {
    width: 80,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    textAlign: 'right',
    color: '#111827',
  },
  percentage: {
    width: 40,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
  },
  removeBtn: {
    padding: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 16,
  },
  addText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    color: '#6B7280',
  },
  confirmBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
