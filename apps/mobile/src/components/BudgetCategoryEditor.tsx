import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCategoryStore } from '../stores/categoryStore';
import { getCategoryDisplayName } from '../utils/categoryDisplayName';
import { useTheme, useStyles, type Theme } from '../theme';
import { formatCurrency } from '@budget/shared-utils';
import { CreateCategoryModal } from './CreateCategoryModal';

export interface BudgetAllocationRow {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  amount: number;
}

interface BudgetCategoryEditorProps {
  currencyCode: string;
  allocations: BudgetAllocationRow[];
  onAllocationsChange: (allocations: BudgetAllocationRow[]) => void;
}

export const BudgetCategoryEditor: React.FC<BudgetCategoryEditorProps> = ({
  currencyCode,
  allocations,
  onAllocationsChange,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { getExpenseCategories } = useCategoryStore();
  const categories = getExpenseCategories();
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

  const usedCategoryIds = new Set(allocations.map((a) => a.categoryId));
  const availableCategories = categories.filter((c) => !usedCategoryIds.has(c.id));

  const addCategory = useCallback((categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    onAllocationsChange([
      ...allocations,
      {
        categoryId: cat.id,
        categoryName: getCategoryDisplayName(cat, t),
        categoryColor: cat.color || undefined,
        amount: 0,
      },
    ]);
    setShowCategoryPicker(false);
  }, [allocations, categories, onAllocationsChange, t]);

  const removeCategory = useCallback((index: number) => {
    onAllocationsChange(allocations.filter((_, i) => i !== index));
  }, [allocations, onAllocationsChange]);

  const updateAmount = useCallback((index: number, amountStr: string) => {
    const amount = parseFloat(amountStr) || 0;
    const newAllocations = [...allocations];
    newAllocations[index] = { ...newAllocations[index], amount };
    onAllocationsChange(newAllocations);
  }, [allocations, onAllocationsChange]);

  return (
    <View>
      <Text style={styles.hint}>{t('budgetNew.byCategoryHint')}</Text>

      {allocations.map((alloc, index) => (
        <View key={alloc.categoryId} style={styles.allocationRow}>
          <View style={[styles.colorDot, { backgroundColor: alloc.categoryColor || '#6B7280' }]} />
          <Text style={styles.categoryName} numberOfLines={1}>{alloc.categoryName}</Text>
          <TextInput
            style={styles.amountInput}
            value={alloc.amount > 0 ? alloc.amount.toString() : ''}
            onChangeText={(text) => updateAmount(index, text)}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
          />
          <TouchableOpacity onPress={() => removeCategory(index)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Add category button */}
      {!showCategoryPicker && availableCategories.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowCategoryPicker(true)}
          style={styles.addBtn}
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.addText}>{t('budgetNew.addCategory')}</Text>
        </TouchableOpacity>
      )}

      {/* Category picker grid */}
      {showCategoryPicker && (
        <View style={styles.pickerContainer}>
          <View style={styles.categoryGrid}>
            {availableCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryChip}
                onPress={() => addCategory(cat.id)}
              >
                <View style={[styles.chipColorDot, { backgroundColor: cat.color || '#6B7280' }]} />
                <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
                  {getCategoryDisplayName(cat, t)}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.categoryChip, styles.addCategoryChip]}
              onPress={() => setShowCreateCategory(true)}
            >
              <Ionicons name="add" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setShowCategoryPicker(false)} style={styles.closePicker}>
            <Text style={styles.closePickerText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <CreateCategoryModal
        visible={showCreateCategory}
        type="expense"
        onClose={() => setShowCreateCategory(false)}
        onCreated={(categoryId) => {
          setShowCreateCategory(false);
          addCategory(categoryId);
        }}
      />

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('budgetNew.totalBudget')}</Text>
        <Text style={styles.totalAmount}>
          {formatCurrency(totalAmount, currencyCode)}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => ({
  hint: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  allocationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  amountInput: {
    width: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: 16,
    fontWeight: '600' as const,
    textAlign: 'right' as const,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  removeBtn: {
    padding: theme.spacing[1],
  },
  addBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  addText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  pickerContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  categoryChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing[1.5],
  },
  addCategoryChip: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    justifyContent: 'center' as const,
  },
  chipColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  closePicker: {
    alignItems: 'center' as const,
    paddingTop: theme.spacing[2],
  },
  closePickerText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    marginTop: theme.spacing[2],
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
});
