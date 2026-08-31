import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useStyles, type Theme } from '@/theme';
import type { FrequentTransfer } from '@/features/wallet/frequentTransfers';

interface Props {
  frequentTransfers: FrequentTransfer[];
  accountName: (id: string) => string;
  onSelect: (transfer: FrequentTransfer) => void;
}

/** Routes the user has moved money along before — one tap refills the form. */
export function FrequentTransferChips({ frequentTransfers, accountName, onSelect }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  if (frequentTransfers.length === 0) return null;

  return (
    <View style={styles.frequentSection}>
      <Text style={styles.label}>{t('transfer.frequent')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {frequentTransfers.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.frequentChip}
            onPress={() => onSelect(f)}
            activeOpacity={0.7}
          >
            <Text style={styles.frequentChipRoute} numberOfLines={1}>
              {accountName(f.fromAccountId)} → {accountName(f.toAccountId)}
            </Text>
            <Text style={styles.frequentChipAmount}>
              {formatCurrency(f.fromAmount, f.fromCurrency)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  frequentSection: {
    marginBottom: theme.spacing[4],
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  frequentChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    marginRight: theme.spacing[2],
    maxWidth: 220,
  },
  frequentChipRoute: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  frequentChipAmount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    marginTop: 2,
  },
});
