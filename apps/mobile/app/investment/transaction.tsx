import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useAccountStore } from '@/stores/accountStore';
import { formatCurrency, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Currency } from '@budget/shared-types';

type TransactionType = 'buy' | 'sell';

export default function AddTransactionScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { holdingId } = useLocalSearchParams<{ holdingId: string }>();
  const { holdings, addTransaction } = useInvestmentStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const accounts = useAccountStore((s) => s.accounts);

  const holding = holdings?.find((h: any) => h.id === holdingId);
  const currentAccount = accounts.find((a) => a.id === currentAccountId);
  const defaultCurrency = (holding?.asset?.priceCurrency || currentAccount?.currencyCode || 'USD') as Currency;

  const [type, setType] = useState<TransactionType>('buy');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  const quantityNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(pricePerUnit) || 0;
  const feeNum = parseFloat(fee) || 0;
  const total = quantityNum * priceNum + feeNum;

  const handleSave = () => {
    if (!quantity || quantityNum <= 0) {
      Alert.alert(t('common.error'), t('investments.invalidQuantity'));
      return;
    }

    if (!pricePerUnit || priceNum <= 0) {
      Alert.alert(t('common.error'), t('investments.invalidPrice'));
      return;
    }

    if (!holdingId) {
      Alert.alert(t('common.error'), t('investments.holdingNotFound'));
      return;
    }

    addTransaction({
      holdingId,
      type,
      quantity: quantityNum,
      pricePerUnit: priceNum,
      fee: feeNum > 0 ? feeNum : undefined,
      date: new Date(date),
      notes: notes.trim() || undefined,
    });

    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('investments.addTransaction')}</Text>

        {/* Type Selector */}
        <Text style={styles.label}>{t('investments.transactionType')}</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              type === 'buy' && styles.typeBuyActive,
            ]}
            onPress={() => setType('buy')}
          >
            <Ionicons
              name="arrow-down-circle-outline"
              size={22}
              color={type === 'buy' ? '#FFFFFF' : theme.colors.success}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'buy' && styles.typeButtonTextActive,
              ]}
            >
              {t('investments.buy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeButton,
              type === 'sell' && styles.typeSellActive,
            ]}
            onPress={() => setType('sell')}
          >
            <Ionicons
              name="arrow-up-circle-outline"
              size={22}
              color={type === 'sell' ? '#FFFFFF' : theme.colors.danger}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'sell' && styles.typeButtonTextActive,
              ]}
            >
              {t('investments.sell')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Currency Selector */}
        <Text style={styles.label}>{t('auth.currency')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.currencyScrollView}
          contentContainerStyle={styles.currencyRow}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[
                styles.currencyPill,
                currency === c.code && styles.currencyPillActive,
              ]}
              onPress={() => setCurrency(c.code)}
            >
              <Text style={[
                styles.currencyPillText,
                currency === c.code && styles.currencyPillTextActive,
              ]}>
                {c.symbol} {c.code}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quantity */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('investments.quantity')}</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Price Per Unit */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('investments.pricePerUnit')} ({currency})</Text>
          <TextInput
            style={styles.input}
            value={pricePerUnit}
            onChangeText={setPricePerUnit}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Fee */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('investments.fee')} ({currency})</Text>
          <TextInput
            style={styles.input}
            value={fee}
            onChangeText={setFee}
            placeholder={t('investments.feeOptional')}
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Date */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('investments.date')}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('investments.notes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('investments.notesPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />
        </View>

        {/* Total Display */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{t('investments.total')}</Text>
          <Text style={styles.totalValue}>{formatCurrency(total, currency)}</Text>
          {quantityNum > 0 && priceNum > 0 && (
            <Text style={styles.totalBreakdown}>
              {quantityNum} x {formatCurrency(priceNum, currency)}{feeNum > 0 ? ` + ${formatCurrency(feeNum, currency)} ${t('investments.fee').toLowerCase()}` : ''}
            </Text>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.submitButton, (!quantity || !pricePerUnit) && styles.submitButtonDisabled]}
          onPress={handleSave}
          disabled={!quantity || !pricePerUnit}
        >
          <Text style={styles.submitButtonText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  title: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[6],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  typeRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  typeBuyActive: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  typeSellActive: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  typeButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontWeight: '600' as const,
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  currencyScrollView: {
    marginBottom: theme.spacing[4],
    marginHorizontal: -theme.spacing[4],
  },
  currencyRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  currencyPill: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius['2xl'],
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyPillText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyPillTextActive: {
    color: theme.colors.textInverse,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    ...theme.shadows.sm,
  },
  input: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
  },
  notesInput: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  totalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[5],
    alignItems: 'center' as const,
    ...theme.shadows.md,
  },
  totalLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  totalValue: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
  },
  totalBreakdown: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
