import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Currency } from '@budget/shared-types';

interface Props {
  available: number | null;
  currency: Currency;
  isOverBalance: boolean;
  onMaxPress: () => void;
}

/**
 * A warning, never a block: transfers get entered after the fact and an account
 * whose initial balance was never set looks emptier than it is.
 */
export function TransferAvailableRow({ available, currency, isOverBalance, onMaxPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      <View style={styles.availableRow}>
        <Text style={styles.availableText}>
          {t('transfer.available')} {available === null ? '—' : formatCurrency(available, currency)}
        </Text>
        {available !== null && available > 0 && (
          <TouchableOpacity
            style={styles.maxButton}
            onPress={onMaxPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.maxButtonText}>{t('transfer.max')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isOverBalance && (
        <View style={styles.warningRow}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
          <Text style={styles.warningText}>{t('transfer.insufficientHint')}</Text>
        </View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  availableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: theme.spacing[2],
  },
  availableText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  maxButton: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  maxButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  warningRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[2],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    flex: 1,
  },
});
