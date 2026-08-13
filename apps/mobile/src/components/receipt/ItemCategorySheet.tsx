import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Category } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export interface ItemCategorySheetItem {
  /** Position of the line in the receipt's own `receiptItems` array. */
  index: number;
  description: string;
  categoryId: string | null;
}

interface Props {
  visible: boolean;
  items: ItemCategorySheetItem[];
  categories: Category[];
  /** `null` returns the line to unassigned — its money then rides with the residual. */
  onChange: (itemIndex: number, categoryId: string | null) => void;
  onClose: () => void;
}

/**
 * Lets the user reassign the category of any receipt line. Each row expands
 * in place into a category list on tap (mirrors the inline category dropdown
 * in `ExpenseFilterBar`); picking a category calls `onChange` and collapses
 * back. The caller (`receipt.tsx`) owns recomputing the split totals through
 * `buildCategorySplits` after every change — this component only reports the
 * user's choice.
 */
export default function ItemCategorySheet({ visible, items, categories, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const handleClose = () => {
    setExpandedIndex(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t('receiptCategorySplit.edit')}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll}>
            {items.map((item) => {
              const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
              const isExpanded = expandedIndex === item.index;
              return (
                <View key={item.index}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => setExpandedIndex(isExpanded ? null : item.index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.description} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={[styles.categoryLine, !category && styles.categoryLineUnassigned]}>
                        {t('receiptCategorySplit.itemCategory')}: {category ? category.name : t('receiptCategorySplit.unassigned')}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.pickerList}>
                      {/* A line can always be put back to unassigned; without this
                          an accidental assignment could only be swapped, never undone. */}
                      <TouchableOpacity
                        style={styles.pickerRow}
                        onPress={() => {
                          onChange(item.index, null);
                          setExpandedIndex(null);
                        }}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={16}
                          color={!item.categoryId ? theme.colors.primary : theme.colors.textSecondary}
                        />
                        <Text
                          style={[styles.pickerRowText, !item.categoryId && styles.pickerRowTextSelected]}
                          numberOfLines={1}
                        >
                          {t('receiptCategorySplit.unassigned')}
                        </Text>
                        {!item.categoryId && (
                          <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                        )}
                      </TouchableOpacity>
                      {categories.map((cat) => {
                        const selected = cat.id === item.categoryId;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.pickerRow}
                            onPress={() => {
                              onChange(item.index, cat.id);
                              setExpandedIndex(null);
                            }}
                          >
                            <Ionicons
                              name={(cat.icon as any) || 'pricetag-outline'}
                              size={16}
                              color={selected ? theme.colors.primary : theme.colors.textSecondary}
                            />
                            <Text
                              style={[styles.pickerRowText, selected && styles.pickerRowTextSelected]}
                              numberOfLines={1}
                            >
                              {cat.name}
                            </Text>
                            {selected && (
                              <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    maxHeight: '80%' as const,
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
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  doneText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing[2],
  },
  rowText: {
    flex: 1,
  },
  description: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  categoryLine: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  categoryLineUnassigned: {
    color: theme.colors.textTertiary,
    fontStyle: 'italic' as const,
  },
  pickerList: {
    paddingLeft: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    gap: theme.spacing[2.5],
  },
  pickerRowText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  pickerRowTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
