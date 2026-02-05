import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function VoiceExpenseScreen() {
  const [showConfirm, setShowConfirm] = useState(false);
  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();

  const {
    isRecording,
    isProcessing,
    transcription,
    parsedExpense,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  } = useVoiceInput();

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: reset }]);
    }
  }, [error, reset]);

  useEffect(() => {
    if (parsedExpense) {
      setShowConfirm(true);
    }
  }, [parsedExpense]);

  const handleRecordPress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleConfirmExpense = async () => {
    if (!parsedExpense) return;

    try {
      await addExpense({
        userId: user?.id || '',
        amount: parsedExpense.amount,
        currencyCode: parsedExpense.currencyCode as Currency,
        description: parsedExpense.description,
        categoryId: parsedExpense.categoryId,
        date: new Date(),
        source: 'voice',
        isRecurring: false,
      });

      Alert.alert('Success', 'Expense added successfully!', [
        { text: 'Add Another', onPress: reset },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save expense');
    }
  };

  const handleEditExpense = () => {
    if (!parsedExpense) return;

    // Navigate to expense form with pre-filled data
    router.push({
      pathname: '/expense/new',
      params: {
        amount: parsedExpense.amount.toString(),
        description: parsedExpense.description,
        categoryId: parsedExpense.categoryId || '',
        currencyCode: parsedExpense.currencyCode,
      },
    });
  };

  const handleCancel = () => {
    if (isRecording) {
      cancelRecording();
    } else {
      reset();
      setShowConfirm(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Voice Expense</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {!showConfirm ? (
          <>
            <View style={styles.instructionContainer}>
              <Ionicons
                name={isRecording ? 'radio-button-on' : 'mic-outline'}
                size={80}
                color={isRecording ? '#FF6B6B' : '#4ECDC4'}
              />
              <Text style={styles.instructionText}>
                {isProcessing
                  ? 'Processing...'
                  : isRecording
                    ? 'Listening... Tap to stop'
                    : 'Tap to start speaking'}
              </Text>
              <Text style={styles.exampleText}>
                Example: "Coffee at Starbucks, five dollars"
              </Text>
            </View>

            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#4ECDC4" />
                <Text style={styles.processingText}>
                  Analyzing your expense...
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                onPress={handleRecordPress}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isRecording ? 'stop' : 'mic'}
                  size={48}
                  color="#fff"
                />
              </TouchableOpacity>
            )}

            {isRecording && (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}

            {transcription && !isProcessing && (
              <View style={styles.transcriptionContainer}>
                <Text style={styles.transcriptionLabel}>You said:</Text>
                <Text style={styles.transcriptionText}>"{transcription}"</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>Confirm Expense</Text>

            <View style={styles.expenseCard}>
              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Amount</Text>
                <Text style={styles.expenseAmount}>
                  {formatCurrency(parsedExpense?.amount || 0, (parsedExpense?.currencyCode || 'USD') as Currency)}
                </Text>
              </View>

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Description</Text>
                <Text style={styles.expenseValue}>{parsedExpense?.description}</Text>
              </View>

              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Category</Text>
                <Text style={styles.expenseValue}>
                  {parsedExpense?.categorySuggestion || 'Uncategorized'}
                </Text>
              </View>

              {parsedExpense?.merchant && (
                <View style={styles.expenseRow}>
                  <Text style={styles.expenseLabel}>Merchant</Text>
                  <Text style={styles.expenseValue}>{parsedExpense.merchant}</Text>
                </View>
              )}

              <View style={styles.confidenceRow}>
                <Ionicons
                  name={parsedExpense && parsedExpense.confidence > 0.8 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={parsedExpense && parsedExpense.confidence > 0.8 ? '#4ECDC4' : '#FFEAA7'}
                />
                <Text style={styles.confidenceText}>
                  {parsedExpense && parsedExpense.confidence > 0.8 ? 'High' : 'Medium'} confidence
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditExpense}
              >
                <Ionicons name="pencil" size={20} color="#4ECDC4" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmExpense}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>Save Expense</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.retryButton} onPress={reset}>
              <Ionicons name="refresh" size={20} color="#666" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  instructionText: {
    fontSize: 18,
    color: '#333',
    marginTop: 24,
    fontWeight: '500',
  },
  exampleText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: '#FF6B6B',
    shadowColor: '#FF6B6B',
  },
  cancelButton: {
    marginTop: 24,
    padding: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  processingContainer: {
    alignItems: 'center',
    padding: 24,
  },
  processingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  transcriptionContainer: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    width: '100%',
  },
  transcriptionLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  transcriptionText: {
    fontSize: 16,
    color: '#333',
    fontStyle: 'italic',
  },
  confirmContainer: {
    width: '100%',
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
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
