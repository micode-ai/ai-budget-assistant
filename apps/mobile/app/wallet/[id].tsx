import { View, Text, TouchableOpacity, TextInput, Platform, ActivityIndicator } from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { DatePicker } from '@/components/DatePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountTransfer } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useTransferEditForm } from '@/hooks/useTransferEditForm';
import { TransferAccountCard } from '@/components/wallet/TransferAccountCard';

/** No balance chip in edit mode — the detail screen has never shown one; a
 * balance figure here would also have to account for the transfer's own
 * already-committed amount, which the create screen's chips don't need to. */
const noBalance = () => null;
const noOpCurrencySelect = () => {};

export default function TransferDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const transfers = useWalletStore((s) => s.transfers);
  const transfer = transfers.find((tr) => tr.id === id);

  if (!transfer) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="swap-horizontal" size={48} color={theme.colors.textTertiary} />
        <Text style={styles.notFoundText}>{t('transfer.notFound')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return <TransferDetailBody transfer={transfer} />;
}

function TransferDetailBody({ transfer }: { transfer: AccountTransfer }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accounts = useAccountStore((s) => s.accounts);
  const fromAccount = accounts.find((a) => a.id === transfer.fromAccountId);
  const toAccount = accounts.find((a) => a.id === transfer.toAccountId);
  const form = useTransferEditForm(transfer);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {form.isEditing ? (
          <>
            <TransferAccountCard
              label={t('transfer.fromAccount')}
              currencyLabel={t('wallet.currency')}
              accounts={form.payableAccounts}
              selectedAccountId={form.fromAccountId}
              onSelectAccount={form.setFromAccountId}
              chipBalance={noBalance}
              showCurrencyPicker={false}
              currency={form.fromCurrency}
              onSelectCurrency={noOpCurrencySelect}
              amount={form.fromAmount}
              onAmountChange={form.onFromAmountChange}
            />
            <TransferAccountCard
              label={t('transfer.toAccount')}
              currencyLabel={t('wallet.currency')}
              accounts={form.otherAccounts}
              selectedAccountId={form.toAccountId}
              onSelectAccount={form.setToAccountId}
              chipBalance={noBalance}
              showCurrencyPicker={false}
              currency={form.toCurrency}
              onSelectCurrency={noOpCurrencySelect}
              amount={form.toAmount}
              onAmountChange={form.onToAmountChange}
            />
          </>
        ) : (
          <View style={styles.amountCard}>
            <Text style={styles.accountLabel}>
              {fromAccount?.name || '...'} → {toAccount?.name || '...'}
            </Text>
            <View style={styles.amountDisplayRow}>
              <Text style={styles.amountFrom}>
                -{formatCurrency(transfer.fromAmount, transfer.fromCurrency)}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
              <Text style={styles.amountTo}>
                +{formatCurrency(transfer.toAmount, transfer.toCurrency)}
              </Text>
            </View>
          </View>
        )}

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('transfer.date')}</Text>
            {form.isEditing ? (
              <TouchableOpacity style={styles.dateButton} onPress={() => form.setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.dateButtonText}>{form.date.toLocaleDateString(getIntlLocale())}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.detailValue}>
                {new Date(transfer.date).toLocaleDateString(getIntlLocale())}
              </Text>
            )}
          </View>
          {form.isEditing && form.showDatePicker && (
            <DatePicker
              value={form.date}
              onChange={(selectedDate) => {
                form.setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) form.setDate(selectedDate);
              }}
            />
          )}

          {(form.isEditing
            ? form.fromCurrency !== form.toCurrency
            : transfer.fromCurrency !== transfer.toCurrency) && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('transfer.rate')}</Text>
              {form.isEditing ? (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>1 {form.fromCurrency} =</Text>
                  <TextInput
                    style={styles.rateEditInput}
                    value={form.exchangeRate}
                    onChangeText={form.onRateChange}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rateLabel}>{form.toCurrency}</Text>
                </View>
              ) : (
                <Text style={styles.detailValue}>
                  1 {transfer.fromCurrency} = {transfer.exchangeRate} {transfer.toCurrency}
                </Text>
              )}
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('transfer.notes')}</Text>
            {form.isEditing ? (
              <TextInput
                style={styles.detailEditInput}
                value={form.notes}
                onChangeText={form.setNotes}
                placeholder={t('transfer.notesPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
              />
            ) : (
              <Text style={styles.detailValue}>{transfer.notes || '-'}</Text>
            )}
          </View>

          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>{t('transfer.countAsIncome')}</Text>
            {form.isEditing ? (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => form.setCountAsIncome(!form.countAsIncome)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, form.countAsIncome && styles.checkboxActive]}>
                  {form.countAsIncome && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxLabel}>{t('transfer.countAsIncomeHint')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.detailValue}>
                {transfer.countAsIncome ? t('common.yes') : t('common.no')}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {form.isEditing ? (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelEditButton} onPress={form.cancelEditing}>
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditButton} onPress={form.handleSave} disabled={form.isSaving}>
                {/* Saving is a round trip now, so a second tap must not start a
                    second update — its rollback baseline would be the already-edited
                    row. */}
                {form.isSaving ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                )}
                <Text style={styles.saveEditText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editButton} onPress={form.startEditing}>
                <Ionicons name="pencil" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={form.handleDelete}>
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
  accountLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  dateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  dateButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
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
  checkboxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
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
  checkboxLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
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
