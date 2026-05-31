import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface GoalAddFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
  currentAmount: number;
  currencyCode: string;
}

export function GoalAddFundsModal({
  visible,
  onClose,
  onConfirm,
  currentAmount,
  currencyCode,
}: GoalAddFundsModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [fundAmount, setFundAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatAmount = (amount: number): string =>
    Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleConfirm = async () => {
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount <= 0) return;
    setIsLoading(true);
    try {
      await onConfirm(amount);
      setFundAmount('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFundAmount('');
    onClose();
  };

  const parsed = parseFloat(fundAmount);
  const isDisabled = !fundAmount || isNaN(parsed) || parsed <= 0 || isLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('goals.addFunds') || 'Add Funds'}</Text>
          <Text style={styles.subtitle}>
            {t('goals.addFundsDescription') || 'How much have you saved?'}
          </Text>

          <TextInput
            style={styles.amountInput}
            value={fundAmount}
            onChangeText={setFundAmount}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
            autoFocus
          />

          <Text style={styles.currentInfo}>
            {t('goals.currentSaved') || 'Currently saved'}:{' '}
            {formatAmount(currentAmount)} {currencyCode}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>{t('common.cancel') || 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isDisabled && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={isDisabled}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.confirmText}>
                  {t('goals.addFundsConfirm') || 'Add'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    ...({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    } as const),
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[5],
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  currentInfo: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
    alignItems: 'center' as const,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
