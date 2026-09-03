import { Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { RecurringPeriod } from '@budget/shared-types';
import { useStyles, useTheme, type Theme } from '@/theme';
import type { RecurringExpenseFieldsState } from '@/hooks/useRecurringExpenseFields';

const PERIODS: RecurringPeriod[] = ['weekly', 'monthly', 'yearly'];

/**
 * The recurring-expense toggle + period picker for expense/new.tsx
 * (tech-debt expense-new-screen-god-file) — extracted verbatim from the
 * screen, no behavior change. State lives in `useRecurringExpenseFields`
 * (owned by the screen, since `handleSubmit` needs the values at save
 * time); this component is purely presentational.
 */
export function RecurringExpenseFields({
  isRecurring,
  setIsRecurring,
  recurringPeriod,
  setRecurringPeriod,
}: RecurringExpenseFieldsState) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.fieldContainer}>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Ionicons name="repeat-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.toggleLabel}>{t('recurring.repeat')}</Text>
        </View>
        <Switch value={isRecurring} onValueChange={setIsRecurring} />
      </View>
      {isRecurring && (
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, recurringPeriod === p && styles.periodChipSelected]}
              onPress={() => setRecurringPeriod(p)}
            >
              <Text
                style={[styles.periodChipText, recurringPeriod === p && styles.periodChipTextSelected]}
              >
                {t(`recurring.${p}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  toggleInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  toggleLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  periodRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  periodChip: {
    flex: 1,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  periodChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  periodChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  periodChipTextSelected: {
    color: '#fff',
    fontWeight: '600' as const,
  },
});
