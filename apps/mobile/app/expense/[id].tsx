import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { useProjectStore } from '@/stores/projectStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  ExpenseDetailsCard,
  type ExpenseDetailsCardHandle,
} from './components/ExpenseDetailsCard';
import { ExpenseItemsSection } from './components/ExpenseItemsSection';
import { ReceiptSection } from './components/ReceiptSection';

export default function ExpenseDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { expenses, deleteExpense, stopRecurringExpense } = useExpenseStore();
  const { loadProjects } = useProjectStore();
  const { loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const expense = expenses.find((e) => e.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const detailsCardRef = useRef<ExpenseDetailsCardHandle>(null);

  useEffect(() => {
    if (edit === 'true') setIsEditing(true);
  }, [edit]);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('expenseDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStopRecurring = () => {
    showAlert(
      t('recurring.stopRecurring'),
      t('recurring.stopRecurringConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('recurring.stopRecurring'),
          style: 'destructive',
          onPress: async () => {
            try {
              await stopRecurringExpense(expense.id);
              showAlert('', t('recurring.stopped'));
            } catch {
              showAlert(t('common.error'), t('errors.saveFailed'));
            }
          },
        },
      ],
    );
  };

  const handleCopy = () => {
    router.push({
      pathname: '/expense/new',
      params: {
        amount: expense.amount.toString(),
        description: expense.description || '',
        categoryId: expense.categoryId || '',
        currencyCode: expense.currencyCode,
        merchant: expense.merchant || '',
      },
    });
  };

  const handleDelete = () => {
    showAlert(t('expenseDetail.deleteTitle'), t('expenseDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteExpense(expense.id);
          router.back();
        },
      },
    ]);
  };

  const sourceLabel: Record<string, string> = {
    manual: t('expenseDetail.sourceManual'),
    voice: t('expenseDetail.sourceVoice'),
    ocr: t('expenseDetail.sourceOcr'),
    import: t('expenseDetail.sourceImport'),
  };

  const sourceIcon: Record<string, string> = {
    manual: 'create-outline',
    voice: 'mic-outline',
    ocr: 'camera-outline',
    import: 'download-outline',
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountText}>
            {formatCurrency(expense.amount, expense.currencyCode)}
          </Text>
          {expense.discountAmount != null && expense.discountAmount > 0 && (
            <Text style={styles.discountText}>
              {t('receipt.discount')}: -{formatCurrency(expense.discountAmount, expense.currencyCode)}
            </Text>
          )}
          <View style={styles.sourceBadge}>
            <Ionicons
              name={(sourceIcon[expense.source] || 'help-circle-outline') as any}
              size={14}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.sourceText}>{sourceLabel[expense.source] || expense.source}</Text>
          </View>
        </View>

        {/* Debt Repayment Banner */}
        {expense.isDebtRepayment && (
          <View style={styles.debtRepaymentBanner}>
            <Ionicons name="return-down-back" size={16} color={theme.colors.warning} />
            <Text style={styles.debtRepaymentText}>{t('debt.isDebtRepayment')}</Text>
          </View>
        )}

        {/* Recurring Series Banner */}
        {expense.isRecurring && expense.recurringId && (
          <View style={styles.recurringBanner}>
            <View style={styles.recurringBannerHeader}>
              <Ionicons name="repeat-outline" size={16} color={theme.colors.primary} />
              <View style={styles.recurringBannerInfo}>
                <Text style={styles.recurringBannerText}>{t('recurring.seriesBanner')}</Text>
                {expense.recurringPeriod && (
                  <Text style={styles.recurringBannerPeriod}>
                    {t('recurring.seriesPeriod', {
                      period: t(`recurring.${expense.recurringPeriod}`),
                    })}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleStopRecurring}
              style={styles.recurringStopButton}
              activeOpacity={0.7}
            >
              <Text style={styles.recurringStopText} numberOfLines={1}>
                {t('recurring.stopRecurring')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Details Card (owns edit form state + splits + tags) */}
        <ExpenseDetailsCard
          ref={detailsCardRef}
          expense={expense}
          isEditing={isEditing}
          onSaved={() => setIsEditing(false)}
        />

        {/* Receipt Items (OCR expenses only) */}
        {expense.source === 'ocr' && (
          <ExpenseItemsSection expenseId={id!} currencyCode={expense.currencyCode} />
        )}

        {/* Receipt Image */}
        <ReceiptSection expenseId={id!} />

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {isEditing ? (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelEditButton}
                onPress={() => setIsEditing(false)}
              >
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveEditButton}
                onPress={() => detailsCardRef.current?.triggerSave()}
              >
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.saveEditText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              {canEdit && (
                <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                  <Ionicons name="pencil" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={22} color={theme.colors.secondary} />
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                  <Ionicons name="trash" size={22} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          )}
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
    padding: theme.spacing[6],
  },
  notFoundText: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
  },
  backButton: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  amountText: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: theme.colors.danger,
  },
  discountText: {
    fontSize: 16,
    color: theme.colors.success,
    fontWeight: '500' as const,
    marginTop: theme.spacing[2],
  },
  sourceBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  sourceText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  actionsContainer: {
    marginTop: theme.spacing[2],
  },
  editActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    gap: theme.spacing[2],
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.textDisabled,
  },
  cancelEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  saveEditButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  saveEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
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
  recurringBanner: {
    backgroundColor: theme.colors.primaryLight || theme.colors.surfaceSecondary,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[3],
    gap: theme.spacing[3],
  },
  recurringBannerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  recurringBannerInfo: {
    flex: 1,
  },
  recurringBannerText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.primary,
  },
  recurringBannerPeriod: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  recurringStopButton: {
    alignSelf: 'flex-start' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  recurringStopText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.danger,
  },
});
