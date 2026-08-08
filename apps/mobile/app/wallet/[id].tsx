import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Platform } from 'react-native';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { DatePicker } from '@/components/DatePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import type { Currency } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';

export default function TransferDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transfers, updateTransfer, deleteTransfer } = useWalletStore();
  const accounts = useAccountStore((s) => s.accounts);
  const transfer = transfers.find((tr) => tr.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editFromAmount, setEditFromAmount] = useState(transfer?.fromAmount?.toString() || '');
  const [editToAmount, setEditToAmount] = useState(transfer?.toAmount?.toString() || '');
  const [editExchangeRate, setEditExchangeRate] = useState(transfer?.exchangeRate?.toString() || '');
  const [editNotes, setEditNotes] = useState(transfer?.notes || '');
  const [editCountAsIncome, setEditCountAsIncome] = useState(transfer?.countAsIncome || false);
  const [editFromAccountId, setEditFromAccountId] = useState(transfer?.fromAccountId || '');
  const [editToAccountId, setEditToAccountId] = useState(transfer?.toAccountId || '');
  const [editDate, setEditDate] = useState(transfer ? new Date(transfer.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  const fromAccount = accounts.find((a) => a.id === transfer.fromAccountId);
  const toAccount = accounts.find((a) => a.id === transfer.toAccountId);

  // Accounts the user may pay from. A viewer cannot be the source of a transfer,
  // which the server enforces too.
  const payableAccounts = accounts.filter((a) => a.myRole !== 'viewer');

  // Currency follows the account, exactly as it does in the create form. Re-homing
  // a transfer while keeping the old currency would store a meaningless row.
  const currencyOf = (accountId: string, fallback: Currency): Currency =>
    (accounts.find((a) => a.id === accountId)?.currencyCode as Currency) ?? fallback;
  const editFromCurrency =
    editFromAccountId === transfer.fromAccountId
      ? transfer.fromCurrency
      : currencyOf(editFromAccountId, transfer.fromCurrency);
  const editToCurrency =
    editToAccountId === transfer.toAccountId
      ? transfer.toCurrency
      : currencyOf(editToAccountId, transfer.toCurrency);

  const handleSave = () => {
    const from = parseAmount(editFromAmount);
    const to = parseAmount(editToAmount);
    const rate = parseAmount(editExchangeRate);

    if (!editFromAccountId || !editToAccountId || editFromAccountId === editToAccountId) {
      showAlert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    updateTransfer(transfer.id, {
      fromAccountId: editFromAccountId,
      toAccountId: editToAccountId,
      fromCurrency: editFromCurrency,
      toCurrency: editToCurrency,
      fromAmount: from,
      toAmount: to,
      exchangeRate: rate,
      date: editDate,
      notes: editNotes.trim() || undefined,
      countAsIncome: editCountAsIncome,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditFromAmount(transfer.fromAmount.toString());
    setEditToAmount(transfer.toAmount.toString());
    setEditExchangeRate(transfer.exchangeRate.toString());
    setEditNotes(transfer.notes || '');
    setEditCountAsIncome(transfer.countAsIncome);
    setEditFromAccountId(transfer.fromAccountId);
    setEditToAccountId(transfer.toAccountId);
    setEditDate(new Date(transfer.date));
    setShowDatePicker(false);
  };

  const handleDelete = () => {
    showAlert(t('transfer.deleteTitle'), t('transfer.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteTransfer(transfer.id);
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.scrollContent}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          {isEditing ? (
            <>
              <Text style={styles.editPickerLabel}>{t('transfer.fromAccount')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editPickerRow}>
                {payableAccounts.map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.editAccountChip,
                      editFromAccountId === account.id && styles.editAccountChipActive,
                    ]}
                    onPress={() => setEditFromAccountId(account.id)}
                  >
                    <Text
                      style={[
                        styles.editAccountChipText,
                        editFromAccountId === account.id && styles.editAccountChipTextActive,
                      ]}
                    >
                      {account.name}
                    </Text>
                    <Text
                      style={[
                        styles.editAccountChipSub,
                        editFromAccountId === account.id && styles.editAccountChipTextActive,
                      ]}
                    >
                      {account.currencyCode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.editPickerLabel}>{t('transfer.toAccount')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editPickerRow}>
                {accounts
                  .filter((a) => a.id !== editFromAccountId)
                  .map((account) => (
                    <TouchableOpacity
                      key={account.id}
                      style={[
                        styles.editAccountChip,
                        editToAccountId === account.id && styles.editAccountChipActive,
                      ]}
                      onPress={() => setEditToAccountId(account.id)}
                    >
                      <Text
                        style={[
                          styles.editAccountChipText,
                          editToAccountId === account.id && styles.editAccountChipTextActive,
                        ]}
                      >
                        {account.name}
                      </Text>
                      <Text
                        style={[
                          styles.editAccountChipSub,
                          editToAccountId === account.id && styles.editAccountChipTextActive,
                        ]}
                      >
                        {account.currencyCode}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </>
          ) : (
            <Text style={styles.accountLabel}>
              {fromAccount?.name || '...'} → {toAccount?.name || '...'}
            </Text>
          )}
          {isEditing ? (
            <View style={styles.amountEditRow}>
              <View style={styles.amountEditCol}>
                <Text style={styles.amountCurrencyLabel}>{editFromCurrency}</Text>
                <TextInput
                  style={styles.amountEditInput}
                  value={editFromAmount}
                  onChangeText={onFromAmountChange}
                  keyboardType="decimal-pad"
                />
              </View>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
              <View style={styles.amountEditCol}>
                <Text style={styles.amountCurrencyLabel}>{editToCurrency}</Text>
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
                -{formatCurrency(transfer.fromAmount, transfer.fromCurrency)}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
              <Text style={styles.amountTo}>
                +{formatCurrency(transfer.toAmount, transfer.toCurrency)}
              </Text>
            </View>
          )}
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('transfer.date')}</Text>
            {isEditing ? (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.dateButtonText}>
                  {editDate.toLocaleDateString(getIntlLocale())}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.detailValue}>
                {new Date(transfer.date).toLocaleDateString(getIntlLocale())}
              </Text>
            )}
          </View>
          {isEditing && showDatePicker && (
            <DatePicker
              value={editDate}
              onChange={(selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) setEditDate(selectedDate);
              }}
            />
          )}

          {(isEditing ? editFromCurrency !== editToCurrency : transfer.fromCurrency !== transfer.toCurrency) && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('transfer.rate')}</Text>
              {isEditing ? (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>1 {editFromCurrency} =</Text>
                  <TextInput
                    style={styles.rateEditInput}
                    value={editExchangeRate}
                    onChangeText={setEditExchangeRate}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rateLabel}>{editToCurrency}</Text>
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
            {isEditing ? (
              <TextInput
                style={styles.detailEditInput}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder={t('transfer.notesPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
              />
            ) : (
              <Text style={styles.detailValue}>
                {transfer.notes || '-'}
              </Text>
            )}
          </View>

          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>{t('transfer.countAsIncome')}</Text>
            {isEditing ? (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setEditCountAsIncome(!editCountAsIncome)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, editCountAsIncome && styles.checkboxActive]}>
                  {editCountAsIncome && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
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
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
              >
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
  accountLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[3],
  },
  editPickerLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  editPickerRow: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
  },
  editAccountChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  editAccountChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  editAccountChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  editAccountChipSub: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontSize: 10,
  },
  editAccountChipTextActive: {
    color: '#FFFFFF',
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
