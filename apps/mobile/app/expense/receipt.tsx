import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReceiptScanner } from '@/features/receipt/useReceiptScanner';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function ReceiptExpenseScreen() {
  const [showConfirm, setShowConfirm] = useState(false);
  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();

  const {
    isProcessing,
    error,
    imageUri,
    scannedReceipt,
    pickFromCamera,
    pickFromGallery,
    reset,
  } = useReceiptScanner();

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: reset }]);
    }
  }, [error, reset]);

  useEffect(() => {
    if (scannedReceipt) {
      setShowConfirm(true);
    }
  }, [scannedReceipt]);

  const handleCameraPress = async () => {
    await pickFromCamera();
  };

  const handleGalleryPress = async () => {
    await pickFromGallery();
  };

  const handleConfirmExpense = async () => {
    if (!scannedReceipt) return;

    try {
      // Parse date if available
      let expenseDate = new Date();
      if (scannedReceipt.date) {
        const parsedDate = new Date(scannedReceipt.date);
        if (!isNaN(parsedDate.getTime())) {
          expenseDate = parsedDate;
        }
      }

      await addExpense({
        userId: user?.id || '',
        amount: scannedReceipt.amount,
        currencyCode: scannedReceipt.currencyCode as Currency,
        description: scannedReceipt.description,
        categoryId: scannedReceipt.categoryId || undefined,
        date: expenseDate,
        source: 'ocr',
        isRecurring: false,
      });

      Alert.alert('Success', 'Expense added successfully!', [
        { text: 'Scan Another', onPress: handleReset },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save expense');
    }
  };

  const handleEditExpense = () => {
    if (!scannedReceipt) return;

    router.push({
      pathname: '/expense/new',
      params: {
        amount: scannedReceipt.amount.toString(),
        description: scannedReceipt.description,
        categoryId: scannedReceipt.categoryId || '',
        currencyCode: scannedReceipt.currencyCode,
      },
    });
  };

  const handleReset = () => {
    reset();
    setShowConfirm(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Receipt</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {!showConfirm ? (
          <>
            <View style={styles.instructionContainer}>
              <Ionicons name="receipt-outline" size={80} color="#4ECDC4" />
              <Text style={styles.instructionText}>
                {isProcessing ? 'Analyzing receipt...' : 'Take a photo or choose from gallery'}
              </Text>
              <Text style={styles.exampleText}>
                Point your camera at a receipt for best results
              </Text>
            </View>

            {isProcessing ? (
              <View style={styles.processingContainer}>
                {imageUri && (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                )}
                <ActivityIndicator size="large" color="#4ECDC4" style={styles.loader} />
                <Text style={styles.processingText}>
                  Extracting data with AI...
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={handleCameraPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={32} color="#fff" />
                  <Text style={styles.scanButtonText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={handleGalleryPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images" size={28} color="#4ECDC4" />
                  <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>Receipt Scanned</Text>

            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.receiptImage} />
            )}

            <View style={styles.expenseCard}>
              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Total Amount</Text>
                <Text style={styles.expenseAmount}>
                  {formatCurrency(
                    scannedReceipt?.amount || 0,
                    (scannedReceipt?.currencyCode || 'USD') as Currency
                  )}
                </Text>
              </View>

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Description</Text>
                <Text style={styles.expenseValue}>{scannedReceipt?.description}</Text>
              </View>

              {scannedReceipt?.merchant && (
                <View style={styles.expenseRow}>
                  <Text style={styles.expenseLabel}>Merchant</Text>
                  <Text style={styles.expenseValue}>{scannedReceipt.merchant}</Text>
                </View>
              )}

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Category</Text>
                <Text style={styles.expenseValue}>
                  {scannedReceipt?.categorySuggestion || 'Uncategorized'}
                </Text>
              </View>

              {scannedReceipt?.date && (
                <View style={styles.expenseRow}>
                  <Text style={styles.expenseLabel}>Date</Text>
                  <Text style={styles.expenseValue}>
                    {new Date(scannedReceipt.date).toLocaleDateString()}
                  </Text>
                </View>
              )}

              {scannedReceipt?.receiptItems && scannedReceipt.receiptItems.length > 0 && (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsTitle}>Items ({scannedReceipt.receiptItems.length})</Text>
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
                      +{scannedReceipt.receiptItems.length - 5} more items
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
                    scannedReceipt && scannedReceipt.confidence > 0.8 ? '#4ECDC4' : '#FFEAA7'
                  }
                />
                <Text style={styles.confidenceText}>
                  {scannedReceipt && scannedReceipt.confidence > 0.8 ? 'High' : 'Medium'} confidence
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.editButton} onPress={handleEditExpense}>
                <Ionicons name="pencil" size={20} color="#4ECDC4" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmExpense}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>Save Expense</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
              <Ionicons name="refresh" size={20} color="#666" />
              <Text style={styles.retryButtonText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 48,
    marginTop: 24,
  },
  instructionText: {
    fontSize: 18,
    color: '#333',
    marginTop: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
  exampleText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  scanButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    gap: 10,
  },
  galleryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  processingContainer: {
    alignItems: 'center',
    padding: 24,
    width: '100%',
  },
  previewImage: {
    width: 200,
    height: 280,
    borderRadius: 12,
    marginBottom: 24,
  },
  loader: {
    marginBottom: 16,
  },
  processingText: {
    fontSize: 16,
    color: '#666',
  },
  confirmContainer: {
    width: '100%',
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  receiptImage: {
    width: 120,
    height: 160,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  expenseCard: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  expenseLabel: {
    fontSize: 14,
    color: '#666',
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  expenseValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  itemsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemDescription: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  itemPrice: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  moreItems: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    gap: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    gap: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 6,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#666',
  },
});
