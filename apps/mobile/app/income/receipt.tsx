import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useReceiptScanner } from '@/features/receipt/useReceiptScanner';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { getIntlLocale } from '@/i18n';

export default function ReceiptIncomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const { addIncome } = useIncomeStore();
  const { user } = useAuthStore();

  const {
    isProcessing,
    error,
    imageUri,
    isPdf,
    scannedReceipt,
    pickFromCamera,
    pickFromGallery,
    pickPdfDocument,
    reset,
  } = useReceiptScanner();

  useEffect(() => {
    if (error) {
      showAlert(t('common.error'), error, [{ text: 'OK', onPress: reset }]);
    }
  }, [error, reset, t]);

  useEffect(() => {
    if (scannedReceipt) {
      setShowConfirm(true);
      useSubscriptionStore.getState().loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedReceipt]);

  const handleConfirmIncome = async () => {
    if (!scannedReceipt) return;
    try {
      let incomeDate = new Date();
      if (scannedReceipt.date) {
        const parsedDate = new Date(scannedReceipt.date + 'T12:00:00');
        if (!isNaN(parsedDate.getTime())) incomeDate = parsedDate;
      }

      let resolvedCategoryId = scannedReceipt.categoryId || undefined;
      if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
        const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'income');
        resolvedCategoryId = matched?.id;
      }

      await addIncome({
        userId: user?.id || '',
        amount: scannedReceipt.amount,
        currencyCode: scannedReceipt.currencyCode as Currency,
        description: scannedReceipt.description,
        categoryId: resolvedCategoryId,
        date: incomeDate,
        source: 'ocr',
        isDebt: false,
        isDebtRepayment: false,
      });

      showAlert(t('common.success'), t('incomeReceipt.success'), [
        { text: t('incomeReceipt.scanAnother'), onPress: handleReset },
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    } catch {
      showAlert(t('common.error'), t('incomeReceipt.saveFailed'));
    }
  };

  const handleEditIncome = () => {
    if (!scannedReceipt) return;

    let resolvedCategoryId = scannedReceipt.categoryId || '';
    if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
      const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'income');
      resolvedCategoryId = matched?.id || '';
    }

    const params = {
      amount: scannedReceipt.amount.toString(),
      description: scannedReceipt.description,
      categoryId: resolvedCategoryId,
      currencyCode: scannedReceipt.currencyCode,
    };

    handleReset();
    router.push({ pathname: '/income/new', params });
  };

  const handleReset = () => {
    reset();
    setShowConfirm(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('incomeReceipt.title')}</Text>
        <AiUsageBadge />
      </View>

      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        {!showConfirm ? (
          <>
            <View style={styles.instructionContainer}>
              <Ionicons name="document-text-outline" size={80} color={theme.colors.success} />
              <Text style={styles.instructionText}>
                {isProcessing ? t('incomeReceipt.analyzing') : t('incomeReceipt.instructions')}
              </Text>
              <Text style={styles.exampleText}>{t('incomeReceipt.hint')}</Text>
            </View>

            <TextInput
              style={styles.userPromptInput}
              placeholder={t('incomeReceipt.userPromptPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              value={userPrompt}
              onChangeText={setUserPrompt}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {isProcessing ? (
              <View style={styles.processingContainer}>
                {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}
                {isPdf && !imageUri && (
                  <Ionicons name="document-text" size={80} color={theme.colors.success} style={{ marginBottom: theme.spacing[6] }} />
                )}
                <ActivityIndicator size="large" color={theme.colors.success} style={styles.loader} />
                <Text style={styles.processingText}>
                  {isPdf ? t('incomeReceipt.analyzingPdf') : t('incomeReceipt.extracting')}
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => pickFromCamera(userPrompt.trim() || undefined)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={32} color={theme.colors.textInverse} />
                  <Text style={styles.scanButtonText}>{t('incomeReceipt.takePhoto')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={() => pickFromGallery(userPrompt.trim() || undefined)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images" size={28} color={theme.colors.success} />
                  <Text style={styles.galleryButtonText}>{t('incomeReceipt.chooseGallery')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={() => pickPdfDocument(userPrompt.trim() || undefined)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="document-text" size={28} color={theme.colors.success} />
                  <Text style={styles.galleryButtonText}>{t('incomeReceipt.choosePdf')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>{t('incomeReceipt.scannedTitle')}</Text>

            {!isPdf && imageUri && (
              <Image source={{ uri: imageUri }} style={styles.receiptImage} />
            )}

            <View style={styles.incomeCard}>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('incomeReceipt.totalAmount')}</Text>
                <Text style={styles.incomeAmount}>
                  {formatCurrency(
                    scannedReceipt?.amount || 0,
                    (scannedReceipt?.currencyCode || 'USD') as Currency
                  )}
                </Text>
              </View>

              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('incomeReceipt.description')}</Text>
                <Text style={styles.incomeValue}>{scannedReceipt?.description}</Text>
              </View>

              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('incomeReceipt.category')}</Text>
                <Text style={styles.incomeValue}>
                  {scannedReceipt?.categorySuggestion || t('common.uncategorized')}
                </Text>
              </View>

              {scannedReceipt?.date && (
                <View style={styles.incomeRow}>
                  <Text style={styles.incomeLabel}>{t('incomeReceipt.date')}</Text>
                  <Text style={styles.incomeValue}>
                    {new Date(scannedReceipt.date + 'T12:00:00').toLocaleDateString(getIntlLocale())}
                  </Text>
                </View>
              )}

              <View style={styles.confidenceRow}>
                <Ionicons
                  name={scannedReceipt && scannedReceipt.confidence > 0.8 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={scannedReceipt && scannedReceipt.confidence > 0.8 ? theme.colors.success : theme.colors.warning}
                />
                <Text style={styles.confidenceText}>
                  {scannedReceipt && scannedReceipt.confidence > 0.8 ? t('incomeReceipt.highConfidence') : t('incomeReceipt.mediumConfidence')}
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.editButton} onPress={handleEditIncome}>
                <Ionicons name="pencil" size={24} color={theme.colors.success} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmIncome}>
                <Ionicons name="checkmark" size={24} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
              <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.retryButtonText}>{t('incomeReceipt.scanAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    padding: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[6],
    alignItems: 'center' as const,
  },
  instructionContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[6],
  },
  instructionText: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[6],
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  exampleText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center' as const,
  },
  userPromptInput: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[6],
    minHeight: 60,
    maxHeight: 100,
  },
  buttonContainer: {
    width: '100%' as const,
    gap: theme.spacing[4],
  },
  scanButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing[5],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.borderRadius.xl,
    gap: theme.spacing[3],
    ...theme.shadows.xl,
  },
  scanButtonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  galleryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.success,
    gap: theme.spacing[2.5],
  },
  galleryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.success,
  },
  processingContainer: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    width: '100%' as const,
  },
  previewImage: {
    width: 200,
    height: 280,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[6],
  },
  loader: {
    marginBottom: theme.spacing[4],
  },
  processingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  confirmContainer: {
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  receiptImage: {
    width: 120,
    height: 160,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  incomeCard: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
  },
  incomeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  incomeLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  incomeAmount: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.success,
  },
  incomeValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    maxWidth: '60%' as const,
    textAlign: 'right' as const,
  },
  confidenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingTop: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  confidenceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  confirmActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
    width: '100%' as const,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.success,
    gap: theme.spacing[2],
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
    gap: theme.spacing[2],
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  retryButtonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});
