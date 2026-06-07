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
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system/next';
import { useReceiptScanner } from '@/features/receipt/useReceiptScanner';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { MerchantInput } from '@/components/MerchantInput';
import { resolveExistingMerchant } from '@/utils/merchant';
import { useCategoryStore } from '@/stores/categoryStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { getIntlLocale } from '@/i18n';

async function compressAndEncodeImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
  );
  const file = new File(result.uri);
  return await file.base64();
}

export default function ReceiptExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveImage, setSaveImage] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [merchant, setMerchant] = useState('');
  const { addExpense } = useExpenseStore();
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
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
      setMerchant(resolveExistingMerchant(scannedReceipt.merchant, getDistinctMerchants()));
      useSubscriptionStore.getState().loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedReceipt]);

  const handleCameraPress = async () => {
    await pickFromCamera(userPrompt.trim() || undefined);
  };

  const handleGalleryPress = async () => {
    await pickFromGallery(userPrompt.trim() || undefined);
  };

  const handlePdfPress = async () => {
    await pickPdfDocument(userPrompt.trim() || undefined);
  };

  const handleConfirmExpense = async () => {
    if (!scannedReceipt) return;

    try {
      // Parse date if available
      // Use "T12:00:00" to parse as local time and avoid timezone date shift
      let expenseDate = new Date();
      if (scannedReceipt.date) {
        const parsedDate = new Date(scannedReceipt.date + 'T12:00:00');
        if (!isNaN(parsedDate.getTime())) {
          expenseDate = parsedDate;
        }
      }

      // Prepare receipt items
      const items = scannedReceipt.receiptItems?.map((item, index) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sortOrder: index,
      }));

      // Compress and encode receipt image if checkbox is checked (not for PDFs)
      let receiptImageBase64: string | undefined;
      if (saveImage && imageUri && !isPdf) {
        try {
          receiptImageBase64 = await compressAndEncodeImage(imageUri);
        } catch (e) {
          console.error('Failed to compress receipt image:', e);
        }
      }

      // Resolve category suggestion (name string) to a local category ID
      let resolvedCategoryId = scannedReceipt.categoryId || undefined;
      if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
        const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'expense');
        resolvedCategoryId = matched?.id;
      }

      await addExpense({
        userId: user?.id || '',
        amount: scannedReceipt.amount,
        discountAmount: scannedReceipt.discountAmount ?? undefined,
        currencyCode: scannedReceipt.currencyCode as Currency,
        description: scannedReceipt.description,
        merchant: merchant.trim() || undefined,
        categoryId: resolvedCategoryId,
        date: expenseDate,
        source: 'ocr',
        isRecurring: false,
        isDebt: false,
        isDebtRepayment: false,
        items,
        receiptImageBase64,
      });

      showAlert(t('common.success'), t('receipt.success'), [
        { text: t('receipt.scanAnother'), onPress: handleReset },
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    } catch {
      showAlert(t('common.error'), t('receipt.saveFailed'));
    }
  };

  const handleEditExpense = () => {
    if (!scannedReceipt) return;

    let resolvedCategoryId = scannedReceipt.categoryId || '';
    if (!resolvedCategoryId && scannedReceipt.categorySuggestion) {
      const matched = useCategoryStore.getState().getCategoryByName(scannedReceipt.categorySuggestion, 'expense');
      resolvedCategoryId = matched?.id || '';
    }

    const params = {
      amount: scannedReceipt.amount.toString(),
      description: scannedReceipt.description,
      merchant: merchant.trim(),
      categoryId: resolvedCategoryId,
      currencyCode: scannedReceipt.currencyCode,
    };

    // Reset scan state so returning to this screen won't allow duplicate creation
    handleReset();

    router.push({ pathname: '/expense/new', params });
  };

  const handleReset = () => {
    reset();
    setShowConfirm(false);
    setSaveImage(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('receipt.title')}</Text>
        <AiUsageBadge />
      </View>

      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        {!showConfirm ? (
          <>
            <View style={styles.instructionContainer}>
              <Ionicons name="receipt-outline" size={80} color={theme.colors.primary} />
              <Text style={styles.instructionText}>
                {isProcessing ? t('receipt.analyzing') : t('receipt.instructions')}
              </Text>
              <Text style={styles.exampleText}>
                {t('receipt.hint')}
              </Text>
            </View>

            <TextInput
              style={styles.userPromptInput}
              placeholder={t('receipt.userPromptPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              value={userPrompt}
              onChangeText={setUserPrompt}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {isProcessing ? (
              <View style={styles.processingContainer}>
                {imageUri && (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                )}
                {isPdf && !imageUri && (
                  <Ionicons name="document-text" size={80} color={theme.colors.primary} style={{ marginBottom: theme.spacing[6] }} />
                )}
                <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
                <Text style={styles.processingText}>
                  {isPdf ? t('receipt.analyzingPdf') : t('receipt.extracting')}
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={handleCameraPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={32} color={theme.colors.textInverse} />
                  <Text style={styles.scanButtonText}>{t('receipt.takePhoto')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={handleGalleryPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images" size={28} color={theme.colors.primary} />
                  <Text style={styles.galleryButtonText}>{t('receipt.chooseGallery')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={handlePdfPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="document-text" size={28} color={theme.colors.primary} />
                  <Text style={styles.galleryButtonText}>{t('receipt.choosePdf')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>{t('receipt.scannedTitle')}</Text>

            {!isPdf && imageUri && (
              <Image source={{ uri: imageUri }} style={styles.receiptImage} />
            )}

            <View style={styles.expenseCard}>
              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>{t('receipt.totalAmount')}</Text>
                <Text style={styles.expenseAmount}>
                  {formatCurrency(
                    scannedReceipt?.amount || 0,
                    (scannedReceipt?.currencyCode || 'USD') as Currency
                  )}
                </Text>
              </View>

              {scannedReceipt?.discountAmount != null && scannedReceipt.discountAmount > 0 && (
                <View style={styles.expenseRow}>
                  <Text style={styles.expenseLabel}>{t('receipt.discount')}</Text>
                  <Text style={[styles.expenseValue, { color: theme.colors.success }]}>
                    -{formatCurrency(
                      scannedReceipt.discountAmount,
                      (scannedReceipt?.currencyCode || 'USD') as Currency
                    )}
                  </Text>
                </View>
              )}

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>{t('receipt.description')}</Text>
                <Text style={styles.expenseValue}>{scannedReceipt?.description}</Text>
              </View>

              <View style={styles.merchantField}>
                <MerchantInput value={merchant} onChangeText={setMerchant} />
              </View>

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>{t('receipt.category')}</Text>
                <Text style={styles.expenseValue}>
                  {scannedReceipt?.categorySuggestion || t('common.uncategorized')}
                </Text>
              </View>

              {scannedReceipt?.date && (
                <View style={styles.expenseRow}>
                  <Text style={styles.expenseLabel}>{t('receipt.date')}</Text>
                  <Text style={styles.expenseValue}>
                    {new Date(scannedReceipt.date + 'T12:00:00').toLocaleDateString(getIntlLocale())}
                  </Text>
                </View>
              )}

              {scannedReceipt?.receiptItems && scannedReceipt.receiptItems.length > 0 && (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsTitle}>{t('receipt.items', { count: scannedReceipt.receiptItems.length })}</Text>
                  {scannedReceipt.receiptItems.slice(0, 5).map((item, index) => (
                    <View key={index} style={styles.itemRow}>
                      <Text style={styles.itemDescription} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.itemPrice}>
                        {formatCurrency(
                          item.totalPrice,
                          (scannedReceipt?.currencyCode || 'USD') as Currency
                        )}
                      </Text>
                    </View>
                  ))}
                  {scannedReceipt.receiptItems.length > 5 && (
                    <Text style={styles.moreItems}>
                      {t('receipt.moreItems', { count: scannedReceipt.receiptItems.length - 5 })}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.confidenceRow}>
                <Ionicons
                  name={
                    scannedReceipt && scannedReceipt.confidence > 0.8
                      ? 'checkmark-circle'
                      : 'alert-circle'
                  }
                  size={16}
                  color={
                    scannedReceipt && scannedReceipt.confidence > 0.8 ? theme.colors.primary : theme.colors.warning
                  }
                />
                <Text style={styles.confidenceText}>
                  {scannedReceipt && scannedReceipt.confidence > 0.8 ? t('receipt.highConfidence') : t('receipt.mediumConfidence')}
                </Text>
              </View>
            </View>

            {!isPdf && (
              <TouchableOpacity
                style={styles.saveImageCheckbox}
                onPress={() => setSaveImage(!saveImage)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={saveImage ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={saveImage ? theme.colors.primary : theme.colors.textTertiary}
                />
                <Text style={styles.saveImageText}>{t('receipt.saveImage')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.editButton} onPress={handleEditExpense}>
                <Ionicons name="pencil" size={24} color={theme.colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmExpense}>
                <Ionicons name="checkmark" size={24} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
              <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.retryButtonText}>{t('receipt.scanAgain')}</Text>
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
  placeholder: {
    width: 36,
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
    backgroundColor: theme.colors.primary,
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
    borderColor: theme.colors.primary,
    gap: theme.spacing[2.5],
  },
  galleryButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
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
  expenseCard: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
  },
  expenseRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  expenseLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
  },
  expenseValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    maxWidth: '60%' as const,
    textAlign: 'right' as const,
  },
  itemsSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
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
  moreItems: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center' as const,
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
  saveImageCheckbox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
    marginBottom: theme.spacing[5],
    paddingHorizontal: theme.spacing[2],
  },
  saveImageText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
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
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  editButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  confirmButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
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
  merchantField: {
    marginTop: theme.spacing[2],
  },
});
