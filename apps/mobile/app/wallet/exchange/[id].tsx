import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';

export default function ExchangeDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { exchanges, updateExchange, deleteExchange } = useWalletStore();
  const exchange = exchanges.find((e) => e.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editFromAmount, setEditFromAmount] = useState(exchange?.fromAmount?.toString() || '');
  const [editToAmount, setEditToAmount] = useState(exchange?.toAmount?.toString() || '');
  const [editExchangeRate, setEditExchangeRate] = useState(
    exchange?.exchangeRate?.toString() || '',
  );
  const [editNotes, setEditNotes] = useState(exchange?.notes || '');

  if (!exchange) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="swap-horizontal" size={48} color={theme.colors.textTertiary} />
        <Text style={styles.notFoundText}>{t('exchange.notFound')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    const from = parseAmount(editFromAmount);
    const to = parseAmount(editToAmount);
    const rate = parseAmount(editExchangeRate);

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    updateExchange(exchange.id, {
      fromAmount: from,
      toAmount: to,
      exchangeRate: rate,
      notes: editNotes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditFromAmount(exchange.fromAmount.toString());
    setEditToAmount(exchange.toAmount.toString());
    setEditExchangeRate(exchange.exchangeRate.toString());
    setEditNotes(exchange.notes || '');
  };

  const handleDelete = () => {
    showAlert(t('exchange.deleteTitle'), t('exchange.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteExchange(exchange.id);
          router.back();
        },
      },
    ]);
  };

  const onFromAmountChange = (value: string) => {
    setEditFromAmount(value);
    const rate = parseAmount(editExchangeRate);
    if (value && rate) {
      setEditToAmount((parseAmount(value) * rate).toFixed(2));
    }
  };

  const onToAmountChange = (value: string) => {
    setEditToAmount(value);
    const rate = parseAmount(editExchangeRate);
    if (value && rate) {
      setEditFromAmount((parseAmount(value) / rate).toFixed(2));
    }
  };

  const onRateChange = (value: string) => {
    setEditExchangeRate(value);
    const from = parseAmount(editFromAmount);
    const rate = parseAmount(value);
    if (isFinite(from) && isFinite(rate) && rate > 0) {
      setEditToAmount((from * rate).toFixed(2));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.pairLabel}>
            {exchange.fromCurrency} → {exchange.toCurrency}
          </Text>
          {isEditing ? (
            <View style={styles.amountEditRow}>
              <View style={styles.amountEditCol}>
                <Text style={styles.amountCurrencyLabel}>{exchange.fromCurrency}</Text>
                <TextInput
                  style={styles.amountEditInput}
                  value={editFromAmount}
                  onChangeText={onFromAmountChange}
                  keyboardType="decimal-pad"
                />
              </View>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
              <View style={styles.amountEditCol}>
                <Text style={styles.amountCurrencyLabel}>{exchange.toCurrency}</Text>
                <TextInput
                  style={styles.amountEditInput}
                  value={editToAmount}
                  onChangeText={onToAmountChange}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          ) : (
            <View style={styles.amountDisplayRow}>
              <Text style={styles.amountFrom}>
                -{formatCurrency(exchange.fromAmount, exchange.fromCurrency)}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
              <Text style={styles.amountTo}>
                +{formatCurrency(exchange.toAmount, exchange.toCurrency)}
              </Text>
            </View>
          )}
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('exchange.date')}</Text>
            <Text style={styles.detailValue}>
              {new Date(exchange.date).toLocaleDateString(getIntlLocale())}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('exchange.rate')}</Text>
            {isEditing ? (
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>1 {exchange.fromCurrency} =</Text>
                <TextInput
                  style={styles.rateEditInput}
                  value={editExchangeRate}
                  onChangeText={onRateChange}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.rateLabel}>{exchange.toCurrency}</Text>
              </View>
            ) : (
              <Text style={styles.detailValue}>
                1 {exchange.fromCurrency} = {exchange.exchangeRate.toFixed(4)} {exchange.toCurrency}
              </Text>
            )}
          </View>

          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>{t('exchange.notes')}</Text>
            {isEditing ? (
              <TextInput
                style={styles.detailEditInput}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder={t('exchange.notesPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
              />
            ) : (
              <Text style={styles.detailValue}>{exchange.notes || '-'}</Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {isEditing ? (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelEditButton} onPress={handleCancel}>
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditButton} onPress={handleSave}>
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.saveEditText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                <Ionicons name="pencil" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
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
  pairLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  amountDisplayRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  amountFrom: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.danger,
  },
  amountTo: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.success,
  },
  amountEditRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  amountEditCol: {
    alignItems: 'center' as const,
    flex: 1,
  },
  amountCurrencyLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  amountEditInput: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    paddingBottom: theme.spacing[1],
    minWidth: 100,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  detailRow: {
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  detailEditInput: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary,
    paddingVertical: theme.spacing[1],
  },
  rateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  rateLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  rateEditInput: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary,
    paddingVertical: theme.spacing[1],
    flex: 1,
    textAlign: 'center' as const,
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
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cancelEditText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
  },
  saveEditButton: {
    flex: 2,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveEditText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textInverse,
  },
});
