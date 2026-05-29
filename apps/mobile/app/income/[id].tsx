import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { getTagsForIncome } from '@/db/tagRepository';
import { TagChip } from '@/components/TagChip';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Tag } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';

export default function IncomeDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { incomes, updateIncome, deleteIncome } = useIncomeStore();
  const { getIncomeCategories, getCategoryById, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const income = incomes.find((i) => i.id === id);

  const [incomeTags, setIncomeTags] = useState<Tag[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (edit === 'true') setIsEditing(true);
  }, [edit]);
  const [editDescription, setEditDescription] = useState(income?.description || '');
  const [editAmount, setEditAmount] = useState(income?.amount?.toString() || '');
  const [editCategory, setEditCategory] = useState(income?.categoryId || '');
  const [editNotes, setEditNotes] = useState(income?.notes || '');
  const [editDate, setEditDate] = useState(income?.date ? new Date(income.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    if (id) {
      getTagsForIncome(id).then(setIncomeTags).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!income) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>{t('incomeDetail.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    const numericAmount = parseFloat(editAmount);
    if (!numericAmount || numericAmount <= 0) return;

    updateIncome(income.id, {
      description: editDescription.trim() || undefined,
      amount: numericAmount,
      categoryId: editCategory || undefined,
      notes: editNotes.trim() || undefined,
      date: editDate,
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    Alert.alert(
      t('incomeDetail.deleteTitle'),
      t('incomeDetail.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteIncome(income.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.content}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          {isEditing ? (
            <TextInput
              style={styles.amountInput}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
            />
          ) : (
            <Text style={styles.amountText}>
              +{formatCurrency(income.amount, income.currencyCode)}
            </Text>
          )}
        </View>

        {/* Debt Repayment Banner */}
        {income.isDebtRepayment && (
          <View style={styles.debtRepaymentBanner}>
            <Ionicons name="return-down-back" size={16} color={theme.colors.warning} />
            <Text style={styles.debtRepaymentText}>{t('debt.isDebtRepayment')}</Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.detailsCard}>
          {/* Description */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('incomeDetail.description')}</Text>
            {isEditing ? (
              <TextInput
                style={styles.detailInput}
                value={editDescription}
                onChangeText={setEditDescription}
              />
            ) : (
              <Text style={styles.detailValue}>
                {income.description || t('incomeDetail.noDescription')}
              </Text>
            )}
          </View>

          {/* Date */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('incomeDetail.date')}</Text>
            {isEditing ? (
              <>
                <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.detailValue}>{formatDate(editDate, undefined, getIntlLocale())}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={editDate}
                    mode="date"
                    onChange={(_, date) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (date) setEditDate(date);
                    }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.detailValue}>{formatDate(income.date, undefined, getIntlLocale())}</Text>
            )}
          </View>

          {/* Category */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('incomeDetail.category')}</Text>
            {isEditing ? (
              <View style={styles.categoryGrid}>
                {getIncomeCategories().map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      editCategory === cat.id && {
                        backgroundColor: cat.color,
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() =>
                      setEditCategory(editCategory === cat.id ? '' : cat.id)
                    }
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        editCategory === cat.id && styles.categoryChipTextSelected,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {getCategoryDisplayName(cat, t)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.detailValue}>
                {(income.categoryId && (() => { const c = getCategoryById(income.categoryId); return c ? getCategoryDisplayName(c, t) : null; })()) || '-'}
              </Text>
            )}
          </View>

          {/* Notes */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('incomeDetail.notes')}</Text>
            {isEditing ? (
              <TextInput
                style={[styles.detailInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
              />
            ) : (
              <Text style={styles.detailValue}>
                {income.notes || '-'}
              </Text>
            )}
          </View>

          {/* Tags Section */}
          {incomeTags.length > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('tags.title')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {incomeTags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} size="small" />
                ))}
              </View>
            </View>
          )}

          {/* Attribution */}
          {income.createdByUserName && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('common.addedBy', { name: income.createdByUserName })}</Text>
            </View>
          )}

          {/* Debt Info Section */}
          {income.isDebt && (
            <View style={styles.debtSection}>
              <View style={styles.debtHeader}>
                <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.debtHeaderText}>{t('debt.borrowed')}</Text>
              </View>
              {income.debtContactName && (
                <View style={styles.debtRow}>
                  <Text style={styles.debtRowLabel}>{t('debt.contact')}</Text>
                  <Text style={styles.debtRowValue}>{income.debtContactName}</Text>
                </View>
              )}
              {income.debtDueDate && (
                <View style={styles.debtRow}>
                  <Text style={styles.debtRowLabel}>{t('debt.dueDate')}</Text>
                  <Text style={styles.debtRowValue}>{new Date(income.debtDueDate).toLocaleDateString()}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.recordRepaymentButton}
                onPress={() => router.push({
                  pathname: '/expense/new',
                  params: {
                    isDebtRepayment: 'true',
                    relatedDebtIncomeId: income.id,
                    debtContactName: income.debtContactName || '',
                    currencyCode: income.currencyCode,
                  },
                })}
              >
                <Ionicons name="return-down-back" size={18} color={theme.colors.success} />
                <Text style={styles.recordRepaymentText}>{t('debt.recordRepayment')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </>
          ) : canEdit ? (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.editButtonText} numberOfLines={1}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                <Text style={styles.deleteButtonText} numberOfLines={1}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  notFoundText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  content: {
    padding: theme.spacing[4],
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[8],
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  amountText: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: theme.colors.success,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: theme.colors.success,
    textAlign: 'center' as const,
    minWidth: 150,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  detailRow: {
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  detailValue: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  detailInput: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2],
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
    borderRadius: theme.borderRadius['2xl'],
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
  actionsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  editButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  deleteButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.danger,
    flexShrink: 1,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
  },
  saveButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  // Debt section
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
  debtRepaymentBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.warningLight || theme.colors.surfaceSecondary,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[3],
  },
  debtRepaymentText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.warning,
  },
});
