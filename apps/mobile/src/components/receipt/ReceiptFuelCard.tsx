import { View, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ScannedFuel } from '@/features/vehicles/receiptFuel';

interface Props {
  fuel: ScannedFuel;
  vehicleName: string;
  odometer: string;
  onOdometerChange: (value: string) => void;
}

/**
 * Offered on the receipt confirm screen when the scan read litres and a price
 * per litre off a fuel line. Only the odometer is left to type; leaving it
 * empty saves the expense without a fuel-log entry.
 */
export default function ReceiptFuelCard({ fuel, vehicleName, odometer, onOdometerChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="car-outline" size={20} color={theme.colors.primary} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('receiptFuel.cardTitle', { vehicle: vehicleName })}</Text>
          <Text style={styles.body}>
            {t('receiptFuel.cardBody', { litres: fuel.litres, price: fuel.pricePerLitre })}
          </Text>
        </View>
      </View>
      <TextInput
        style={styles.input}
        value={odometer}
        onChangeText={onOdometerChange}
        placeholder={t('receiptFuel.odometerLabel')}
        placeholderTextColor={theme.colors.textTertiary}
        keyboardType="number-pad"
        accessibilityLabel={t('receiptFuel.odometerLabel')}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    width: '100%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    gap: theme.spacing[3],
  },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  headerText: { flex: 1 },
  title: { ...theme.textStyles.bodySmMedium, color: theme.colors.textPrimary, fontWeight: '600' as const },
  body: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: theme.spacing[0.5] },
  input: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
});
