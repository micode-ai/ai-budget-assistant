import { useState, useEffect } from 'react';
import {
  View,
  Text,
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
import { useTheme, useStyles, type Theme } from '@/theme';

export default function VoiceExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
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
      await addExpense({
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
          <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
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
              color={isRecording ? theme.colors.danger : theme.colors.primary}
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
              <ActivityIndicator size="large" color={theme.colors.primary} />
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
                color={theme.colors.textInverse}
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
                  placeholderTextColor={theme.colors.textTertiary}
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
                  placeholderTextColor={theme.colors.textTertiary}
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
                  color={parsedExpense && parsedExpense.confidence > 0.8 ? theme.colors.primary : theme.colors.warning}
                />
                <Text style={styles.confidenceText}>
                  {parsedExpense && parsedExpense.confidence > 0.8 ? t('voice.highConfidence') : t('voice.mediumConfidence')}
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
                <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.retryButtonText}>{t('voice.tryAgain')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmExpense}
              >
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.confirmButtonText}>{t('voice.saveExpense')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  flex: {
    flex: 1,
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
  content: {
    flex: 1,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  instructionContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
  },
  instructionText: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[6],
    fontWeight: '500' as const,
  },
  exampleText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
    fontStyle: 'italic' as const,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...theme.shadows.xl,
  },
  recordButtonActive: {
    backgroundColor: theme.colors.danger,
  },
  cancelButton: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[3],
  },
  cancelButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  processingContainer: {
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  processingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
  transcriptionContainer: {
    marginTop: theme.spacing[8],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    width: '100%' as const,
  },
  transcriptionLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  transcriptionText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontStyle: 'italic' as const,
  },
  // Confirmation screen
  confirmScrollContent: {
    padding: theme.spacing[6],
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[6],
    textAlign: 'center' as const,
  },
  expenseCard: {
    width: '100%' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
  },
  fieldGroup: {
    marginBottom: theme.spacing[4],
  },
  fieldLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1.5],
  },
  amountInput: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    textAlign: 'center' as const,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  categoryChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  categoryChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  confidenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingTop: theme.spacing[2],
    gap: theme.spacing[1.5],
  },
  confidenceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  confirmActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[1.5],
  },
  retryButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  confirmButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  confirmButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
