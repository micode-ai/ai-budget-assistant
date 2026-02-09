import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB'];

export default function SetBalanceScreen() {
  const { t } = useTranslation();
  const { walletBalances, walletSummary, setInitialBalance, removeBalance } = useWalletStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    setInitialBalance(selectedCurrency, parsedAmount);
    setAmount('');
    Alert.alert(t('common.success'), t('wallet.balanceSaved'));
  };

  const handleDelete = (id: string, currencyCode: string) => {
    Alert.alert(
      t('wallet.deleteBalance'),
      t('wallet.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => removeBalance(id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('wallet.setInitialBalance')}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{t('wallet.currency')}</Text>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, selectedCurrency === c && styles.currencyChipActive]}
                onPress={() => setSelectedCurrency(c)}
              >
                <Text style={[styles.currencyChipText, selectedCurrency === c && styles.currencyChipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('wallet.amount')}</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>

        {walletBalances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('wallet.balances')}</Text>
            {walletBalances.filter((b) => !b.isDeleted).map((balance) => {
              const summary = walletSummary.find((s) => s.currencyCode === balance.currencyCode);
              return (
                <View key={balance.id} style={styles.balanceRow}>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceCurrency}>{balance.currencyCode}</Text>
                    <Text style={styles.balanceAmount}>
                      {t('wallet.initialBalance')}: {formatCurrency(balance.initialAmount, balance.currencyCode)}
                    </Text>
                    {summary && (
                      <Text style={styles.balanceCurrent}>
                        {t('wallet.currentBalance')}: {formatCurrency(summary.currentBalance, summary.currencyCode)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(balance.id, balance.currencyCode)}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[6],
    ...theme.shadows.md,
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  currencyGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: '#FFFFFF',
  },
  amountInput: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[5],
  },
  saveButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: '#FFFFFF',
  },
  section: {
    marginBottom: theme.spacing[4],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  balanceRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceCurrency: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  balanceAmount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  balanceCurrent: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  deleteButton: {
    padding: theme.spacing[2],
  },
});
