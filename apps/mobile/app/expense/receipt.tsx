import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useReceiptScanner } from '@/features/receipt/useReceiptScanner';
import { isReceiptSessionCheckpoint } from '@/features/receipt/receiptScanSession';
import { useReceiptCategorySplit } from '@/hooks/useReceiptCategorySplit';
import { useReceiptSave } from '@/hooks/useReceiptSave';
import { useReceiptScanSession } from '@/hooks/useReceiptScanSession';
import { useExpenseStore } from '@/stores/expenseStore';
import { resolveExistingMerchant } from '@/utils/merchant';
import ReceiptCaptureView from '@/components/receipt/ReceiptCaptureView';
import ReceiptConfirmCard from '@/components/receipt/ReceiptConfirmCard';
import ItemCategorySheet from '@/components/receipt/ItemCategorySheet';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { AiUsageBadge } from '@/components/AiUsageBadge';

export default function ReceiptExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveImage, setSaveImage] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [merchant, setMerchant] = useState('');
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
  const { getExpenseCategories } = useCategoryStore();

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

  const {
    itemCategories,
    splitDropped,
    currentSplits,
    proposedNamesInPlay,
    proposedNamesToCreate,
    sheetItems,
    showSplitSheet,
    setShowSplitSheet,
    handleItemCategoryChange,
    resetSplitState,
  } = useReceiptCategorySplit(scannedReceipt);

  const handleReset = () => {
    reset();
    setShowConfirm(false);
    setSaveImage(false);
    resetSplitState();
  };

  const { count: sessionCount, recordSaved } = useReceiptScanSession();

  const { handleConfirmExpense, handleEditExpense } = useReceiptSave({
    scannedReceipt,
    merchant,
    saveImage,
    imageUri,
    isPdf,
    currentSplits,
    itemCategories,
    proposedNamesToCreate,
    onReset: handleReset,
    onSaved: () => {
      const count = recordSaved();
      return { count, isCheckpoint: isReceiptSessionCheckpoint(count) };
    },
  });

  const handleCameraPress = async () => {
    await pickFromCamera(userPrompt.trim() || undefined);
  };

  const handleGalleryPress = async () => {
    await pickFromGallery(userPrompt.trim() || undefined);
  };

  const handlePdfPress = async () => {
    await pickPdfDocument(userPrompt.trim() || undefined);
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
          <ReceiptCaptureView
            isProcessing={isProcessing}
            imageUri={imageUri}
            isPdf={isPdf}
            userPrompt={userPrompt}
            onUserPromptChange={setUserPrompt}
            onCameraPress={handleCameraPress}
            onGalleryPress={handleGalleryPress}
            onPdfPress={handlePdfPress}
            sessionCount={sessionCount}
          />
        ) : (
          <>
            <ReceiptConfirmCard
              scannedReceipt={scannedReceipt}
              imageUri={imageUri}
              isPdf={isPdf}
              merchant={merchant}
              onMerchantChange={setMerchant}
              currentSplits={currentSplits}
              splitDropped={splitDropped}
              sheetItemsLength={sheetItems.length}
              onOpenSplitSheet={() => setShowSplitSheet(true)}
              saveImage={saveImage}
              onToggleSaveImage={() => setSaveImage(!saveImage)}
              onEdit={handleEditExpense}
              onConfirm={handleConfirmExpense}
              onRetry={handleReset}
            />

            <ItemCategorySheet
              visible={showSplitSheet}
              items={sheetItems}
              categories={getExpenseCategories()}
              proposedNames={proposedNamesInPlay}
              onChange={handleItemCategoryChange}
              onClose={() => setShowSplitSheet(false)}
            />
          </>
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
});
