import { ReactNode } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import type { Account, AccountRole, Currency } from '@budget/shared-types';

type AccountWithRole = Account & { myRole: AccountRole };

const CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

interface Props {
  label: string;
  currencyLabel: string;
  accounts: AccountWithRole[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  chipBalance: (id: string, currencyCode: string) => number | null;
  /** Currency picker is only shown when the two sides' currencies differ (or always, for `from`). */
  showCurrencyPicker: boolean;
  currency: Currency;
  onSelectCurrency: (currency: Currency) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  /** Extra content rendered below the amount input — e.g. the available/Max/warning row. */
  footer?: ReactNode;
}

/**
 * One side of the transfer form — account picker + optional currency picker +
 * amount input. Shared by both the "from" and "to" cards; the "from" side passes
 * its available-balance row as `footer`, the "to" side passes nothing.
 */
export function TransferAccountCard({
  label,
  currencyLabel,
  accounts,
  selectedAccountId,
  onSelectAccount,
  chipBalance,
  showCurrencyPicker,
  currency,
  onSelectCurrency,
  amount,
  onAmountChange,
  footer,
}: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountPicker}>
        {accounts.map((account) => {
          const balance = chipBalance(account.id, account.currencyCode);
          const active = selectedAccountId === account.id;
          return (
            <TouchableOpacity
              key={account.id}
              style={[styles.accountChip, active && styles.accountChipActive]}
              onPress={() => onSelectAccount(account.id)}
            >
              <Text style={[styles.accountChipText, active && styles.accountChipTextActive]}>
                {account.name}
              </Text>
              <Text style={[styles.accountChipType, active && styles.accountChipTextActive]}>
                {balance === null
                  ? account.currencyCode
                  : formatCurrency(balance, account.currencyCode)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {showCurrencyPicker && (
        <>
          <Text style={[styles.label, { marginTop: theme.spacing[3] }]}>{currencyLabel}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
                onPress={() => onSelectCurrency(c)}
              >
                <Text
                  style={[styles.currencyChipText, currency === c && styles.currencyChipTextActive]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <TextInput
        style={styles.amountInput}
        value={amount}
        onChangeText={onAmountChange}
        placeholder="0.00"
        placeholderTextColor={theme.colors.textTertiary}
        keyboardType="decimal-pad"
      />

      {footer}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
  accountPicker: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
  },
  accountChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  accountChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  accountChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  accountChipType: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontSize: 10,
  },
  accountChipTextActive: {
    color: '#FFFFFF',
  },
  currencyPicker: {
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing[2],
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
});
