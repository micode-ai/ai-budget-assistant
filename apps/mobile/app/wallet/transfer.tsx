import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { DatePicker } from '@/components/DatePicker';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@budget/shared-utils';
import { useTransferForm } from '@/hooks/useTransferForm';
import { FrequentTransferChips } from '@/components/wallet/FrequentTransferChips';
import { TransferAccountCard } from '@/components/wallet/TransferAccountCard';
import { TransferAvailableRow } from '@/components/wallet/TransferAvailableRow';
import { useTranslation } from 'react-i18next';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function TransferScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const form = useTransferForm();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/wallet/transfers')}
              accessibilityLabel={t('transfer.allTransfers')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="time-outline" size={24} color={theme.colors.textInverse} />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        <FrequentTransferChips
          frequentTransfers={form.frequentTransfers}
          accountName={form.accountName}
          onSelect={form.applyFrequentTransfer}
        />

        <TransferAccountCard
          label={t('transfer.fromAccount')}
          currencyLabel={t('wallet.currency')}
          accounts={form.payableAccounts}
          selectedAccountId={form.fromAccountId}
          onSelectAccount={form.setFromAccountId}
          chipBalance={form.chipBalance}
          showCurrencyPicker
          currency={form.fromCurrency}
          onSelectCurrency={form.setFromCurrency}
          amount={form.fromAmount}
          onAmountChange={form.onFromAmountChange}
          footer={
            <TransferAvailableRow
              available={form.availableFrom}
              currency={form.fromCurrency}
              isOverBalance={form.isOverBalance}
              onMaxPress={form.applyMaxAmount}
            />
          }
        />

        <View style={styles.swapContainer}>
          <Ionicons name="arrow-down" size={24} color={theme.colors.primary} />
        </View>

        <TransferAccountCard
          label={t('transfer.toAccount')}
          currencyLabel={t('wallet.currency')}
          accounts={form.otherAccounts}
          selectedAccountId={form.toAccountId}
          onSelectAccount={form.setToAccountId}
          chipBalance={form.chipBalance}
          showCurrencyPicker={form.fromCurrency !== form.toCurrency}
          currency={form.toCurrency}
          onSelectCurrency={form.setToCurrency}
          amount={form.toAmount}
          onAmountChange={form.onToAmountChange}
        />

        {/* Exchange Rate (only if currencies differ) */}
        {form.fromCurrency !== form.toCurrency && (
          <View style={styles.card}>
            <Text style={styles.label}>
              {t('transfer.rate')} {form.loadingRate ? '...' : ''}
            </Text>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>1 {form.fromCurrency} =</Text>
              <TextInput
                style={styles.rateInput}
                value={form.exchangeRate}
                onChangeText={form.onRateChange}
                placeholder="0.0000"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
              />
              <Text style={styles.rateLabel}>{form.toCurrency}</Text>
            </View>
          </View>
        )}

        {/* Date — pre-filled with today; tap to record a past transfer */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('transfer.date')}</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => form.setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.dateButtonText}>
              {formatDate(form.date, undefined, getIntlLocale())}
            </Text>
          </TouchableOpacity>
          {form.showDatePicker && (
            <DatePicker
              value={form.date}
              onChange={(selectedDate) => {
                form.setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) form.setDate(selectedDate);
              }}
            />
          )}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('transfer.notes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={form.notes}
            onChangeText={form.setNotes}
            placeholder={t('transfer.notesPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
          />
        </View>

        {/* Count as Income */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => form.setCountAsIncome(!form.countAsIncome)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, form.countAsIncome && styles.checkboxActive]}>
              {form.countAsIncome && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <View style={styles.checkboxTextContainer}>
              <Text style={styles.checkboxLabel}>{t('transfer.countAsIncome')}</Text>
              <Text style={styles.checkboxHint}>{t('transfer.countAsIncomeHint')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={form.handleSubmit}>
          <Text style={styles.submitButtonText}>{t('transfer.submit')}</Text>
        </TouchableOpacity>
      </KeyboardAwareScreen>
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  swapContainer: {
    alignSelf: 'center' as const,
    padding: theme.spacing[2],
    marginVertical: -theme.spacing[2],
    zIndex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.full,
  },
  rateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  rateLabel: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textSecondary,
  },
  rateInput: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    textAlign: 'center' as const,
  },
  dateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  dateButtonText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
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
  checkboxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  checkboxHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  submitButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: '#FFFFFF',
  },
});
