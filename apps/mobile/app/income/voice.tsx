import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system/next';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import { SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CreateCategoryModal } from '@/components/CreateCategoryModal';
import i18n from '@/i18n';

interface ParsedIncome {
  amount: number;
  currencyCode: string;
  description: string;
  categoryId?: string;
  categorySuggestion: string;
  confidence: number;
}

export default function VoiceIncomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [parsedIncome, setParsedIncome] = useState<ParsedIncome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingRef, setRecordingRef] = useState<Audio.Recording | null>(null);

  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCurrencyCode, setEditCurrencyCode] = useState('');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  const { addIncome } = useIncomeStore();
  const { user } = useAuthStore();
  const { getIncomeCategories, getCategoryByName, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert(t('common.error'), error, [{ text: 'OK', onPress: handleReset }]);
    }
  }, [error, t]);

  useEffect(() => {
    if (parsedIncome) {
      setEditAmount(parsedIncome.amount.toString());
      setEditDescription(parsedIncome.description || '');
      const suggestedName = parsedIncome.categorySuggestion || '';
      const matchedCategory = suggestedName ? getCategoryByName(suggestedName, 'income') : undefined;
      setEditCategory(matchedCategory?.id || parsedIncome.categoryId || '');
      setEditCurrencyCode(parsedIncome.currencyCode || user?.currencyCode || 'USD');
      setShowConfirm(true);
      useSubscriptionStore.getState().loadUsage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedIncome]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError(i18n.t('errors.micPermissionDenied'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecordingRef(recording);
      setIsRecording(true);
      setError(null);
      setTranscription(null);
      setParsedIncome(null);
    } catch {
      setError(i18n.t('errors.startRecordingFailed'));
    }
  };

  const stopRecording = async () => {
    if (!recordingRef) return;
    setIsRecording(false);
    setIsProcessing(true);
    try {
      await recordingRef.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.getURI();
      setRecordingRef(null);
      if (!uri) throw new Error('No recording URI');

      const file = new File(uri);
      const base64Audio = await file.base64();
      const transcriptionResult = await api.transcribeAudio(base64Audio);
      setTranscription(transcriptionResult.text);

      const parsed = await api.parseIncome(transcriptionResult.text);
      setParsedIncome(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t('errors.processRecordingFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setIsRecording(false);
    setIsProcessing(false);
    setTranscription(null);
    setParsedIncome(null);
    setError(null);
    setShowConfirm(false);
    setEditAmount('');
    setEditDescription('');
    setEditCategory('');
    setEditCurrencyCode('');
    if (recordingRef) {
      recordingRef.stopAndUnloadAsync().catch(() => {});
      setRecordingRef(null);
    }
  };

  const handleConfirmIncome = async () => {
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
      await addIncome({
        userId: user?.id || '',
        amount: numericAmount,
        currencyCode: editCurrencyCode as Currency,
        description: editDescription.trim(),
        categoryId: editCategory || undefined,
        date: new Date(),
        source: 'voice',
        isDebt: false,
        isDebtRepayment: false,
      });
      Alert.alert(t('common.success'), t('incomeVoice.success'), [
        { text: t('incomeVoice.addAnother'), onPress: handleReset },
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t('common.error'), t('incomeVoice.saveFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {!showConfirm ? (
        <View style={styles.content}>
          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>
              {isProcessing
                ? t('incomeVoice.processing')
                : isRecording
                  ? t('incomeVoice.listening')
                  : t('incomeVoice.tapToStart')}
            </Text>
            <Text style={styles.exampleText}>{t('incomeVoice.example')}</Text>
          </View>

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color={theme.colors.success} />
              <Text style={styles.processingText}>{t('incomeVoice.analyzing')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
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
            <TouchableOpacity style={styles.cancelButton} onPress={handleReset}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          )}

          {transcription && !isProcessing && (
            <View style={styles.transcriptionContainer}>
              <Text style={styles.transcriptionLabel}>{t('incomeVoice.youSaid')}</Text>
              <Text style={styles.transcriptionText}>"{transcription}"</Text>
            </View>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView contentContainerStyle={styles.confirmScrollContent}>
            <Text style={styles.confirmTitle}>{t('incomeVoice.confirmTitle')}</Text>

            <View style={styles.incomeCard}>
              {/* Amount + Currency */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('incomeVoice.amount')}</Text>
                <View style={styles.amountRow}>
                  <TouchableOpacity
                    style={styles.currencyButton}
                    onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
                  >
                    <Text style={styles.currencyText}>
                      {SUPPORTED_CURRENCIES.find((c) => c.code === editCurrencyCode)?.symbol || '$'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.amountInput}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
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
                          setEditCurrencyCode(currency.code);
                          setShowCurrencyPicker(false);
                        }}
                      >
                        <Text style={styles.pickerSymbol}>{currency.symbol}</Text>
                        <Text style={styles.pickerLabel}>{currency.name}</Text>
                        {editCurrencyCode === currency.code && (
                          <Ionicons name="checkmark" size={20} color={theme.colors.success} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('incomeVoice.description')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder={t('incomeVoice.descriptionPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                />
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('incomeVoice.category')}</Text>
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
                      onPress={() => setEditCategory(editCategory === cat.id ? '' : cat.id)}
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          styles.categoryChipText,
                          editCategory === cat.id && styles.categoryChipTextSelected,
                        ]}
                      >
                        {getCategoryDisplayName(cat, t)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.categoryChip, styles.addCategoryChip]}
                    onPress={() => setShowCreateCategory(true)}
                  >
                    <Ionicons name="add" size={16} color={theme.colors.success} />
                  </TouchableOpacity>
                </View>
              </View>

              <CreateCategoryModal
                visible={showCreateCategory}
                type="income"
                onClose={() => setShowCreateCategory(false)}
                onCreated={(categoryId) => {
                  setEditCategory(categoryId);
                  setShowCreateCategory(false);
                }}
              />

              {/* Confidence */}
              <View style={styles.confidenceRow}>
                <Ionicons
                  name={parsedIncome && parsedIncome.confidence > 0.8 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={parsedIncome && parsedIncome.confidence > 0.8 ? theme.colors.success : theme.colors.warning}
                />
                <Text style={styles.confidenceText}>
                  {parsedIncome && parsedIncome.confidence > 0.8 ? t('incomeVoice.highConfidence') : t('incomeVoice.mediumConfidence')}
                </Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmIncome}>
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.confirmButtonText}>{t('incomeVoice.saveIncome')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
                <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.retryButtonText}>{t('incomeVoice.tryAgain')}</Text>
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
    backgroundColor: theme.colors.success,
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
  incomeCard: {
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
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  currencyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing[2],
    gap: theme.spacing[1],
  },
  currencyText: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: theme.colors.success,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: theme.colors.success,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    textAlign: 'center' as const,
  },
  pickerContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[2],
    overflow: 'hidden' as const,
  },
  pickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[3],
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
    width: '31%' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.xl,
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
  addCategoryChip: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.success,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
    gap: theme.spacing[3],
  },
  confirmButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
    gap: theme.spacing[2],
  },
  confirmButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  retryButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});
