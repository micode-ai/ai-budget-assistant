import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useVoiceInput } from '@/features/voice/useVoiceInput';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_EXPENSE_CATEGORIES } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function VoiceExpenseScreen() {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const { addExpense } = useExpenseStore();
  const { user } = useAuthStore();

  // Editable fields
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCurrencyCode, setEditCurrencyCode] = useState('');

  const {
    isRecording,
    isProcessing,
    transcription,
    parsedExpense,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    reset: resetVoice,
  } = useVoiceInput();

  useEffect(() => {
    if (error) {
      Alert.alert(t('common.error'), error, [{ text: 'OK', onPress: resetVoice }]);
    }
  }, [error, resetVoice]);

  useEffect(() => {
    if (parsedExpense) {
      setEditAmount(parsedExpense.amount.toString());
      setEditDescription(parsedExpense.description || '');
      setEditMerchant(parsedExpense.merchant || '');
      setEditCategory(parsedExpense.categorySuggestion || '');
      setEditCurrencyCode(parsedExpense.currencyCode || user?.currencyCode || 'USD');
      setShowConfirm(true);
    }
  }, [parsedExpense]);

  const handleReset = () => {
    resetVoice();
    setShowConfirm(false);
    setEditAmount('');
    setEditDescription('');
    setEditMerchant('');
    setEditCategory('');
    setEditCurrencyCode('');
  };

  const handleRecordPress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleConfirmExpense = async () => {
    const numericAmount = parseFloat(editAmount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (!editDescription.trim()) {
      Alert.alert(t('common.error'), t('validation.noDescription'));
      return;
    }

    try {
      addExpense({
        userId: user?.id || '',
        amount: numericAmount,
        currencyCode: editCurrencyCode as Currency,
        description: editDescription.trim(),
        notes: editMerchant.trim() || undefined,
        categoryId: editCategory || undefined,
        date: new Date(),
        source: 'voice',
        isRecurring: false,
      });

      Alert.alert(t('common.success'), t('voice.success'), [
        { text: t('voice.addAnother'), onPress: handleReset },
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(t('common.error'), t('voice.saveFailed'));
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      cancelRecording();
    } else {
      handleReset();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('voice.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      {!showConfirm ? (
        <View style={styles.content}>
          <View style={styles.instructionContainer}>
            <Ionicons
              name={isRecording ? 'radio-button-on' : 'mic-outline'}
              size={80}
              color={isRecording ? '#FF6B6B' : '#4ECDC4'}
            />
            <Text style={styles.instructionText}>
              {isProcessing
                ? t('voice.processing')
                : isRecording
                  ? t('voice.listening')
                  : t('voice.tapToStart')}
            </Text>
            <Text style={styles.exampleText}>
              {t('voice.example')}
            </Text>
          </View>

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#4ECDC4" />
              <Text style={styles.processingText}>
                {t('voice.analyzing')}
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
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          )}

          {transcription && !isProcessing && (
            <View style={styles.transcriptionContainer}>
              <Text style={styles.transcriptionLabel}>{t('voice.youSaid')}</Text>
              <Text style={styles.transcriptionText}>"{transcription}"</Text>
            </View>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.confirmScrollContent}>
            <Text style={styles.confirmTitle}>{t('voice.confirmTitle')}</Text>

            <View style={styles.expenseCard}>
              {/* Amount */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('voice.amount')}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('voice.description')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder={t('voice.description')}
                  placeholderTextColor="#999"
                />
              </View>

              {/* Merchant */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('voice.merchant')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  placeholder={t('voice.merchant')}
                  placeholderTextColor="#999"
                />
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('voice.category')}</Text>
                <View style={styles.categoryGrid}>
                  {DEFAULT_EXPENSE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.name}
                      style={[
                        styles.categoryChip,
                        editCategory === cat.name && {
                          backgroundColor: cat.color,
                          borderColor: cat.color,
                        },
                      ]}
                      onPress={() =>
                        setEditCategory(editCategory === cat.name ? '' : cat.name)
                      }
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          editCategory === cat.name && styles.categoryChipTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Confidence */}
              <View style={styles.confidenceRow}>
                <Ionicons
                  name={parsedExpense && parsedExpense.confidence > 0.8 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={parsedExpense && parsedExpense.confidence > 0.8 ? '#4ECDC4' : '#FFEAA7'}
                />
                <Text style={styles.confidenceText}>
                  {parsedExpense && parsedExpense.confidence > 0.8 ? t('voice.highConfidence') : t('voice.mediumConfidence')}
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
                <Ionicons name="refresh" size={20} color="#666" />
                <Text style={styles.retryButtonText}>{t('voice.tryAgain')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmExpense}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>{t('voice.saveExpense')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
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
  // Confirmation screen
  confirmScrollContent: {
    padding: 24,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  expenseCard: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    textAlign: 'center',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    gap: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 6,
  },
  retryButtonText: {
    fontSize: 16,
    color: '#666',
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
});
