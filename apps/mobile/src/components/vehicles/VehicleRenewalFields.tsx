import React, { useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '@/components/DatePicker';
import { RENEWAL_FIELD, RENEWAL_KINDS, type RenewalField, type RenewalForm } from '@/features/vehicles/vehicleRenewals';
import { parseDay } from '@/features/vehicles/vehicleDisplay';
import { getIntlLocale } from '@/i18n';
import { toDateInputValue } from '@/utils/dateInput';
import { useTheme, useStyles, type Theme } from '@/theme';

const LABEL_KEY: Record<RenewalField, string> = {
  nextInsuranceDate: 'vehicles.nextInsurance',
  nextInspectionDate: 'vehicles.nextInspection',
  nextServiceDate: 'vehicles.nextService',
};

/**
 * The vehicle sheet's renewal block (ABA-829): three dates and the service
 * odometer target. Dates are calendar days through `DatePicker` and
 * `toDateInputValue`; the clear button sets null, which the save sends as
 * `null` so the server clears it. Shared by phone and the desktop settings pane.
 */
export function VehicleRenewalFields({
  form,
  onChange,
  odometerInvalid,
}: {
  form: RenewalForm;
  onChange: (next: RenewalForm) => void;
  odometerInvalid: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const dayFormat = new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const [picking, setPicking] = useState<RenewalField | null>(null);

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t('vehicles.renewalsTitle')}</Text>
      <Text style={styles.hint}>{t('vehicles.renewalsHint')}</Text>
      {RENEWAL_KINDS.map((kind) => {
        const field = RENEWAL_FIELD[kind];
        const day = form[field];
        return (
          <View key={field} style={styles.row}>
            <Text style={styles.label}>{t(LABEL_KEY[field])}</Text>
            <View style={styles.valueRow}>
              <TouchableOpacity
                style={styles.valueButton}
                onPress={() => setPicking(picking === field ? null : field)}
                accessibilityRole="button"
                accessibilityLabel={`${t(LABEL_KEY[field])}: ${day ? dayFormat.format(parseDay(day)) : t('vehicles.setDate')}`}
              >
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={day ? styles.value : styles.placeholder}>
                  {day ? dayFormat.format(parseDay(day)) : t('vehicles.setDate')}
                </Text>
              </TouchableOpacity>
              {!!day && (
                <TouchableOpacity
                  onPress={() => {
                    setPicking(null);
                    onChange({ ...form, [field]: null });
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('vehicles.clearDate')}
                >
                  <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            {picking === field && (
              <DatePicker
                value={day ? parseDay(day) : new Date()}
                onChange={(picked) => {
                  // `=== 'ios'` so web and Android close on pick or dismiss.
                  setPicking(Platform.OS === 'ios' ? field : null);
                  if (picked) onChange({ ...form, [field]: toDateInputValue(picked) });
                }}
              />
            )}
          </View>
        );
      })}
      <View style={styles.row}>
        <Text style={styles.label}>{t('vehicles.serviceOdometer')}</Text>
        <TextInput
          style={[styles.input, odometerInvalid && styles.inputInvalid]}
          value={form.nextServiceOdometer}
          onChangeText={(text) => onChange({ ...form, nextServiceOdometer: text })}
          placeholder="60000"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
          maxLength={9}
          accessibilityLabel={t('vehicles.serviceOdometer')}
        />
        {odometerInvalid && <Text style={styles.error}>{t('vehicles.odometerInvalid')}</Text>}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  block: { marginBottom: theme.spacing[4] },
  title: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing[1] },
  hint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[2] },
  row: { marginBottom: theme.spacing[3] },
  label: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  valueRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  valueButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
  },
  value: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  placeholder: { ...theme.textStyles.body, color: theme.colors.textTertiary },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputInvalid: { borderColor: theme.colors.danger },
  error: { ...theme.textStyles.caption, color: theme.colors.danger, marginTop: theme.spacing[1] },
});
