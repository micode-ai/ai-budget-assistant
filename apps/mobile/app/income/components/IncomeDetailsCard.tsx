import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { parseAmount } from '@/utils/amount';
import { DatePicker } from '@/components/DatePicker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { getTagsForIncome } from '@/db/tagRepository';
import { TagChip } from '@/components/TagChip';
import { formatCurrency, formatDate, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { Currency, Income, Tag } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';

export interface IncomeDetailsCardHandle {
  triggerSave: () => void;
}

interface IncomeDetailsCardProps {
  income: Income;
  isEditing: boolean;
  onSaved: () => void;
}

export const IncomeDetailsCard = forwardRef<IncomeDetailsCardHandle, IncomeDetailsCardProps>(
  function IncomeDetailsCard({ income, isEditing, onSaved }, ref) {
    const { t } = useTranslation();
    const theme = useTheme();
    const styles = useStyles(createStyles);
    const { updateIncome } = useIncomeStore();
    const { getIncomeCategories, getCategoryById } = useCategoryStore();

    const [incomeTags, setIncomeTags] = useState<Tag[]>([]);

    // Edit form state
    const [editDescription, setEditDescription] = useState(income?.description || '');
    const [editAmount, setEditAmount] = useState(income?.amount?.toString() || '');
    // Changing the currency RELABELS the income — it never converts the amount
    // (same rule as ExpenseDetailsCard's ABA-379 currency chip).
    const [editCurrencyCode, setEditCurrencyCode] = useState<Currency>(
      (income?.currencyCode as Currency) || 'USD',
    );
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [editCategory, setEditCategory] = useState(income?.categoryId || '');
    const [editNotes, setEditNotes] = useState(income?.notes || '');
    const [editDate, setEditDate] = useState(income?.date ? new Date(income.date) : new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
      getTagsForIncome(income.id).then(setIncomeTags).catch(() => {});
    }, [income.id]);

    // Reset edit state whenever editing is turned off (mirrors ExpenseDetailsCard)
    useEffect(() => {
      if (!isEditing) {
        setEditDescription(income?.description || '');
        setEditAmount(income?.amount?.toString() || '');
        setEditCurrencyCode((income?.currencyCode as Currency) || 'USD');
        setShowCurrencyPicker(false);
        setEditCategory(income?.categoryId || '');
        setEditNotes(income?.notes || '');
        setEditDate(income?.date ? new Date(income.date) : new Date());
        setShowDatePicker(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing]);

    useImperativeHandle(ref, () => ({
      triggerSave: () => {
        const numericAmount = parseAmount(editAmount);
        if (!numericAmount || numericAmount <= 0) return;

        updateIncome(income.id, {
          description: editDescription.trim() || undefined,
          amount: numericAmount,
          currencyCode: editCurrencyCode,
          categoryId: editCategory || undefined,
          notes: editNotes.trim() || undefined,
          date: editDate,
        });
        onSaved();
      },
    }));

    return (
      <>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          {isEditing ? (
            <>
              <View style={styles.amountEditRow}>
                <TextInput
                  style={[styles.amountInput, styles.amountEditInput]}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.currencyChip}
                  onPress={() => setShowCurrencyPicker((v) => !v)}
                  accessibilityLabel={t('incomeDetail.currency')}
                >
                  <Text style={styles.currencyChipText}>
                    {SUPPORTED_CURRENCIES.find((c) => c.code === editCurrencyCode)?.symbol || '$'}{' '}
                    {editCurrencyCode}
                  </Text>
                  <Ionicons
                    name={showCurrencyPicker ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {showCurrencyPicker && (
                <View style={styles.pickerContainer}>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <TouchableOpacity
                      key={currency.code}
                      style={[
                        styles.pickerItem,
                        editCurrencyCode === currency.code && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setEditCurrencyCode(currency.code as Currency);
                        setShowCurrencyPicker(false);
                      }}
                    >
                      <Text style={styles.pickerSymbol}>{currency.symbol}</Text>
                      <Text style={styles.pickerLabel}>{currency.name}</Text>
                      {editCurrencyCode === currency.code && (
                        <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
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
                  <DatePicker
                    value={editDate}
                    onChange={(date) => {
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
      </>
    );
  },
);

const createStyles = (theme: Theme) => ({
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
  amountEditRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    width: '100%' as const,
  },
  amountEditInput: {
    minWidth: 0,
    flexShrink: 1,
  },
  currencyChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  pickerContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[3],
    width: '100%' as const,
    overflow: 'hidden' as const,
  },
  pickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pickerItemSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  pickerSymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    width: 30,
  },
  pickerLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    flex: 1,
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
