import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useProjectStore } from '@/stores/projectStore';
import { getTagsForExpense } from '@/db/tagRepository';
import { getSplitsForExpense, insertSplit, deleteAllSplitsForExpense } from '@/db/splitRepository';
import { api } from '@/services/api';
import { TagChip } from '@/components/TagChip';
import { MerchantInput } from '@/components/MerchantInput';
import { ProjectPicker } from '@/components/ProjectPicker';
import { SplitEditor } from '@/components/SplitEditor';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { formatDate, formatCurrency, generateUUID } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Expense, ExpenseCategorySplit, Tag } from '@budget/shared-types';

export interface ExpenseDetailsCardHandle {
  triggerSave: () => Promise<void>;
}

interface ExpenseDetailsCardProps {
  expense: Expense;
  isEditing: boolean;
  onSaved: () => void;
}

export const ExpenseDetailsCard = forwardRef<ExpenseDetailsCardHandle, ExpenseDetailsCardProps>(
  function ExpenseDetailsCard({ expense, isEditing, onSaved }, ref) {
    const { t } = useTranslation();
    const theme = useTheme();
    const styles = useStyles(createStyles);
    const { updateExpense, setExpenseProject } = useExpenseStore();
    const { getExpenseCategories, getCategoryById } = useCategoryStore();
    const { projects } = useProjectStore();

    // Edit form state
    const [editAmount, setEditAmount] = useState(expense?.amount?.toString() || '');
    const [editDescription, setEditDescription] = useState(expense?.description || '');
    const [editCategory, setEditCategory] = useState(expense?.categoryId || '');
    const [editProjectId, setEditProjectId] = useState<string | null>(expense?.projectId ?? null);
    const [editMerchant, setEditMerchant] = useState(expense?.merchant || '');
    const [editDate, setEditDate] = useState(expense?.date ? new Date(expense.date) : new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Splits and tags
    const [splits, setSplits] = useState<ExpenseCategorySplit[]>([]);
    const [showSplitEditor, setShowSplitEditor] = useState(false);
    const [expenseTags, setExpenseTags] = useState<Tag[]>([]);

    useEffect(() => {
      getTagsForExpense(expense.id).then(setExpenseTags).catch(() => {});
      getSplitsForExpense(expense.id).then(setSplits).catch(() => {});
    }, [expense.id]);

    // Reset edit state whenever editing is turned off
    useEffect(() => {
      if (!isEditing) {
        setEditAmount(expense?.amount?.toString() || '');
        setEditDescription(expense?.description || '');
        setEditCategory(expense?.categoryId || '');
        setEditProjectId(expense?.projectId ?? null);
        setEditMerchant(expense?.merchant || '');
        setEditDate(expense?.date ? new Date(expense.date) : new Date());
        setShowDatePicker(false);
      }
    }, [isEditing]);

    const persistSplits = useCallback(async (
      nextSplits: { categoryId: string; amount: number; percentage: number; notes?: string }[]
    ): Promise<void> => {
      await deleteAllSplitsForExpense(expense.id);
      const now = new Date();
      const newSplits: ExpenseCategorySplit[] = [];
      for (const s of nextSplits) {
        const split: ExpenseCategorySplit = {
          id: generateUUID(),
          expenseId: expense.id,
          categoryId: s.categoryId,
          amount: s.amount,
          percentage: s.percentage,
          notes: s.notes,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          syncVersion: 0,
        };
        await insertSplit(split);
        newSplits.push(split);
      }
      setSplits(newSplits);
      api.setExpenseSplits(expense.id, nextSplits.map(s => ({
        categoryId: s.categoryId,
        amount: s.amount,
        percentage: s.percentage,
        notes: s.notes,
      }))).catch(e => console.error('Failed to sync splits to server:', e));
    }, [expense.id]);

    useImperativeHandle(ref, () => ({
      triggerSave: async () => {
        const numericAmount = parseFloat(editAmount);
        if (!numericAmount || numericAmount <= 0) {
          showAlert(t('common.error'), t('validation.invalidAmount'));
          return;
        }

        const oldAmount = expense.amount;

        updateExpense(expense.id, {
          amount: numericAmount,
          description: editDescription.trim(),
          categoryId: editCategory || undefined,
          merchant: editMerchant.trim() === '' ? '' : editMerchant.trim(),
          date: editDate,
        });

        await setExpenseProject(expense.id, editProjectId);

        try {
          if (splits.length > 0 && numericAmount !== oldAmount && oldAmount > 0) {
            const ratio = numericAmount / oldAmount;
            let runningSum = 0;
            const rescaled = splits.map((s, i) => {
              let amount: number;
              if (i === splits.length - 1) {
                amount = Math.round((numericAmount - runningSum) * 100) / 100;
              } else {
                amount = Math.round(s.amount * ratio * 100) / 100;
                runningSum += amount;
              }
              return {
                categoryId: s.categoryId,
                amount,
                percentage: numericAmount > 0 ? (amount / numericAmount) * 100 : 0,
                notes: s.notes,
              };
            });
            await persistSplits(rescaled);
          }
        } catch (e) {
          console.error('Failed to rescale splits:', e);
        } finally {
          onSaved();
        }
      },
    }));

    const handleSaveSplits = async (
      editorSplits: {
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        notes?: string;
      }[]
    ) => {
      await persistSplits(
        editorSplits.map((s) => ({
          categoryId: s.categoryId,
          amount: s.amount,
          percentage: s.percentage,
          notes: s.notes,
        }))
      );
      setShowSplitEditor(false);
    };

    const handleRemoveSplits = async () => {
      showAlert(t('splits.removeSplit'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteAllSplitsForExpense(expense.id);
            setSplits([]);
            api
              .removeExpenseSplits(expense.id)
              .catch((e) => console.error('Failed to remove splits on server:', e));
          },
        },
      ]);
    };

    return (
      <View style={styles.detailsCard}>
        {/* Amount — only shown as editable field in edit mode; AmountCard handles view-mode display */}
        {isEditing && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.amount')}</Text>
            <TextInput
              style={styles.detailEditInput}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
        )}

        {/* Description */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('expenseDetail.description')}</Text>
          {isEditing ? (
            <TextInput
              style={styles.detailEditInput}
              value={editDescription}
              onChangeText={setEditDescription}
            />
          ) : (
            <Text style={styles.detailValue}>
              {expense.description || t('expenseDetail.noDescription')}
            </Text>
          )}
        </View>

        {/* Merchant */}
        {isEditing ? (
          <View style={styles.detailRow}>
            <MerchantInput value={editMerchant} onChangeText={setEditMerchant} />
          </View>
        ) : expense.merchant ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenses.merchant')}</Text>
            <Text style={styles.detailValue}>{expense.merchant}</Text>
          </View>
        ) : null}

        {/* Date */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('expenseDetail.date')}</Text>
          {isEditing ? (
            <>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.datePickerText}>
                  {formatDate(editDate, undefined, getIntlLocale())}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event: any, selectedDate?: Date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) setEditDate(selectedDate);
                  }}
                />
              )}
            </>
          ) : (
            <Text style={styles.detailValue}>
              {formatDate(expense.date, undefined, getIntlLocale())}
            </Text>
          )}
        </View>

        {/* Category */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('expenseDetail.category')}</Text>
          {isEditing ? (
            <View style={styles.categoryGrid}>
              {getExpenseCategories().map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    editCategory === cat.id && {
                      backgroundColor: cat.color,
                      borderColor: cat.color,
                    },
                  ]}
                  onPress={() => setEditCategory(editCategory === cat.id ? '' : cat.id)}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.categoryChipText,
                      editCategory === cat.id && styles.categoryChipTextSelected,
                    ]}
                  >
                    {getCategoryDisplayName(cat, t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.detailValue}>
              {(expense.categoryId &&
                (() => {
                  const c = getCategoryById(expense.categoryId);
                  return c ? getCategoryDisplayName(c, t) : null;
                })()) || t('common.uncategorized')}
            </Text>
          )}
        </View>

        {/* Notes (view-only) */}
        {expense.notes && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.notes')}</Text>
            <Text style={styles.detailValue}>{expense.notes}</Text>
          </View>
        )}

        {/* Tags (view-only) */}
        {expenseTags.length > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('tags.title')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {expenseTags.map((tag) => (
                <TagChip key={tag.id} name={tag.name} color={tag.color} size="small" />
              ))}
            </View>
          </View>
        )}

        {/* Project */}
        {isEditing ? (
          <View style={styles.detailRow}>
            <ProjectPicker selectedProjectId={editProjectId} onProjectChange={setEditProjectId} />
          </View>
        ) : expense.projectId ? (
          (() => {
            const project = projects.find((p) => p.id === expense.projectId);
            return project ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('projects.title')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: project.color || '#6366F1',
                    }}
                  />
                  <Text style={styles.detailValue}>{project.name}</Text>
                </View>
              </View>
            ) : null;
          })()
        ) : null}

        {/* Category splits display */}
        {splits.length > 0 && !showSplitEditor && (
          <View style={styles.detailRow}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.detailLabel}>{t('splits.title')}</Text>
              <TouchableOpacity onPress={handleRemoveSplits}>
                <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
            {splits.map((split) => {
              const cat = getCategoryById(split.categoryId);
              return (
                <View key={split.id} style={styles.splitRow}>
                  <View style={[styles.splitDot, { backgroundColor: cat?.color || '#6B7280' }]} />
                  <Text style={styles.splitName}>
                    {cat ? getCategoryDisplayName(cat, t) : split.categoryId}
                  </Text>
                  <Text style={styles.splitAmount}>
                    {formatCurrency(split.amount, expense.currencyCode)}
                  </Text>
                  <Text style={styles.splitPercent}>{split.percentage.toFixed(0)}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Split editor */}
        {showSplitEditor && (
          <View style={styles.detailRow}>
            <SplitEditor
              totalAmount={expense.amount}
              currencyCode={expense.currencyCode}
              initialSplits={splits.map((s) => {
                const cat = getCategoryById(s.categoryId);
                return {
                  categoryId: s.categoryId,
                  categoryName: cat ? getCategoryDisplayName(cat, t) : s.categoryId,
                  amount: s.amount,
                  percentage: s.percentage,
                  notes: s.notes,
                };
              })}
              onSplitsChange={handleSaveSplits}
              onCancel={() => setShowSplitEditor(false)}
            />
          </View>
        )}

        {/* Split by categories button */}
        {!isEditing && !showSplitEditor && splits.length === 0 && (
          <TouchableOpacity style={styles.splitButton} onPress={() => setShowSplitEditor(true)}>
            <Ionicons name="git-branch-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.splitButtonText}>{t('splits.splitExpense')}</Text>
          </TouchableOpacity>
        )}

        {/* Attribution */}
        {expense.createdByUserName && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              {t('common.addedBy', { name: expense.createdByUserName })}
            </Text>
          </View>
        )}

        {/* Debt info */}
        {expense.isDebt && (
          <View style={styles.debtSection}>
            <View style={styles.debtHeader}>
              <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.debtHeaderText}>{t('debt.lent')}</Text>
            </View>
            {expense.debtContactName && (
              <View style={styles.debtRow}>
                <Text style={styles.debtRowLabel}>{t('debt.contact')}</Text>
                <Text style={styles.debtRowValue}>{expense.debtContactName}</Text>
              </View>
            )}
            {expense.debtDueDate && (
              <View style={styles.debtRow}>
                <Text style={styles.debtRowLabel}>{t('debt.dueDate')}</Text>
                <Text style={styles.debtRowValue}>
                  {new Date(expense.debtDueDate).toLocaleDateString()}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.recordRepaymentButton}
              onPress={() =>
                router.push({
                  pathname: '/income/new',
                  params: {
                    isDebtRepayment: 'true',
                    relatedDebtExpenseId: expense.id,
                    debtContactName: expense.debtContactName || '',
                    currencyCode: expense.currencyCode,
                  },
                })
              }
            >
              <Ionicons name="return-down-back" size={18} color={theme.colors.success} />
              <Text style={styles.recordRepaymentText}>{t('debt.recordRepayment')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
);

const createStyles = (theme: Theme) => ({
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  detailRow: {
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  detailEditInput: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary,
    paddingVertical: theme.spacing[1],
  },
  datePickerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.divider,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start' as const,
  },
  datePickerText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  categoryChip: {
    width: '31%' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  categoryChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  categoryChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  splitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  splitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  splitName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  splitAmount: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  splitPercent: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    width: 36,
    textAlign: 'right' as const,
  },
  splitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
  },
  splitButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  debtSection: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[3],
  },
  debtHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  debtHeaderText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  debtRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  debtRowLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  debtRowValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  recordRepaymentButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  recordRepaymentText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.success,
  },
});
