import { Platform, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '@/components/DatePicker';
import { useStyles, useTheme, type Theme } from '@/theme';
import type { DebtExpenseFieldsState } from '@/hooks/useDebtExpenseFields';

interface Props extends DebtExpenseFieldsState {
  /** True when this expense is a repayment of an existing debt (routed in
   * via params) — renders a read-only banner instead of the toggle+fields. */
  isDebtRepayment: boolean;
  /** Contact name for the repayment banner, from route params. */
  repaymentContactName?: string;
}

/**
 * The "lend money" debt sub-form for expense/new.tsx (tech-debt
 * expense-new-screen-god-file) — extracted verbatim from the screen, no
 * behavior change. State lives in `useDebtExpenseFields` (owned by the
 * screen, since `handleSubmit` needs the values at save time); this
 * component is purely presentational.
 */
export function DebtExpenseFields({
  isDebtRepayment,
  repaymentContactName,
  isDebt,
  setIsDebt,
  debtContactName,
  setDebtContactName,
  debtDueDate,
  setDebtDueDate,
  showDebtDatePicker,
  setShowDebtDatePicker,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (isDebtRepayment) {
    return (
      <View style={styles.debtBanner}>
        <Ionicons name="return-down-back" size={18} color={theme.colors.warning} />
        <Text style={styles.debtBannerText}>{t('debt.isDebtRepayment')}</Text>
        {repaymentContactName ? (
          <Text style={styles.debtBannerContact}>{repaymentContactName}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fieldContainer}>
      <View style={styles.debtToggleRow}>
        <View style={styles.debtToggleInfo}>
          <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.debtToggleLabel}>{t('debt.lendMoney')}</Text>
        </View>
        <Switch value={isDebt} onValueChange={setIsDebt} />
      </View>
      {isDebt && (
        <View style={styles.debtFields}>
          <TextInput
            style={styles.textInput}
            placeholder={t('debt.contactNamePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            value={debtContactName}
            onChangeText={setDebtContactName}
          />
          <TouchableOpacity
            style={styles.debtDateButton}
            onPress={() => {
              if (debtDueDate) {
                setDebtDueDate(null);
                setShowDebtDatePicker(false);
              } else {
                setShowDebtDatePicker(true);
              }
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.debtDateText}>
              {debtDueDate
                ? `${t('debt.dueDate')}: ${debtDueDate.toLocaleDateString()}`
                : t('debt.setDueDate')}
            </Text>
            {debtDueDate && (
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            )}
          </TouchableOpacity>
          {showDebtDatePicker && (
            <DatePicker
              value={debtDueDate || new Date(Date.now() + 30 * 86400000)}
              minimumDate={new Date()}
              onChange={(selectedDate) => {
                // `=== 'ios'` (not `!== 'android'`) so web closes on
                // pick/dismiss too — the old android-only check left the
                // web input stuck open.
                setShowDebtDatePicker(Platform.OS === 'ios');
                if (selectedDate) setDebtDueDate(selectedDate);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  debtBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.warningLight || theme.colors.surfaceSecondary,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[6],
  },
  debtBannerText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.warning,
  },
  debtBannerContact: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 'auto' as const,
  },
  debtToggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  debtToggleInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  debtToggleLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  debtFields: {
    marginTop: theme.spacing[3],
    gap: theme.spacing[3],
  },
  debtDateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
  },
  debtDateText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.primary,
  },
});
