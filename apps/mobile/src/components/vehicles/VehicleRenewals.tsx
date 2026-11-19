import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Vehicle } from '@budget/shared-types';
import {
  RENEWAL_FIELD,
  RENEWAL_KINDS,
  dayKey,
  dueRenewals,
  isOverdue,
  todayKey,
  type RenewalDue,
} from '@/features/vehicles/vehicleRenewals';
import { formatKm, parseDay } from '@/features/vehicles/vehicleDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Renewal dates of a vehicle in the app (ABA-829): the "due soon" chips on
 * the vehicles list and the Renewals card on the vehicle screen (phone and
 * desktop draw the same card). Rules in `features/vehicles/vehicleRenewals.ts`.
 */

function useRenewalText() {
  const { t } = useTranslation();
  const locale = getIntlLocale();
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const formatDay = (day: string) => dayFormat.format(parseDay(day));
  const text = (r: RenewalDue) => {
    const what = t(`vehicles.renewal_${r.kind}`);
    if (r.by === 'odometer') {
      return r.kmLeft <= 0
        ? t('vehicles.renewalKmOverdue', { what, km: formatKm(-r.kmLeft, locale) })
        : t('vehicles.renewalKm', { what, km: formatKm(r.kmLeft, locale) });
    }
    if (r.days < 0) return t('vehicles.renewalOverdue', { what, date: formatDay(r.date) });
    if (r.days === 0) return t('vehicles.renewalToday', { what });
    return t('vehicles.renewalDue', { what, date: formatDay(r.date) });
  };
  return { text, formatDay, locale };
}

/** One chip per due renewal; nothing when none is due. */
export function VehicleRenewalChips({
  vehicle,
  latestOdometerKm,
}: {
  vehicle: Vehicle;
  latestOdometerKm: number | null | undefined;
}) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { text } = useRenewalText();
  const due = dueRenewals(vehicle, todayKey(), latestOdometerKm);
  if (due.length === 0) return null;
  return (
    <View style={styles.chips}>
      {due.map((r) => {
        const overdue = isOverdue(r);
        return (
          <View key={`${r.kind}-${r.by}`} style={[styles.chip, overdue ? styles.chipOverdue : styles.chipSoon]}>
            <Ionicons
              name={overdue ? 'alert-circle-outline' : 'time-outline'}
              size={14}
              color={overdue ? theme.colors.danger : theme.colors.warning}
            />
            <Text style={styles.chipText}>{text(r)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Every renewal set on the vehicle, due or not, with the due ones marked —
 * the vehicle screen's card. With nothing set it says where to set them.
 */
export function VehicleRenewalsCard({
  vehicle,
  latestOdometerKm,
}: {
  vehicle: Vehicle;
  latestOdometerKm: number | null | undefined;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { text, formatDay, locale } = useRenewalText();
  const due = dueRenewals(vehicle, todayKey(), latestOdometerKm);

  const rows: { key: string; label: string; value: string; status: RenewalDue | undefined }[] = [];
  for (const kind of RENEWAL_KINDS) {
    const day = dayKey(vehicle[RENEWAL_FIELD[kind]]);
    if (!day) continue;
    rows.push({
      key: kind,
      label: t(`vehicles.renewal_${kind}`),
      value: formatDay(day),
      status: due.find((r) => r.kind === kind && r.by === 'date'),
    });
  }
  if (vehicle.nextServiceOdometer != null) {
    rows.push({
      key: 'odometer',
      label: t('vehicles.renewalServiceKm'),
      value: `${formatKm(vehicle.nextServiceOdometer, locale)} km`,
      status: due.find((r) => r.by === 'odometer'),
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('vehicles.renewalsTitle')}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('vehicles.renewalsEmpty')}</Text>
      ) : (
        rows.map((row, i) => (
          <View key={row.key} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.rowTop}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
            {row.status && (
              <Text style={[styles.rowStatus, { color: isOverdue(row.status) ? theme.colors.danger : theme.colors.warning }]}>
                {text(row.status)}
              </Text>
            )}
          </View>
        ))
      )}
      {latestOdometerKm != null && vehicle.nextServiceOdometer != null && (
        <Text style={styles.empty}>{t('vehicles.renewalOdometerNow', { km: formatKm(latestOdometerKm, locale) })}</Text>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2], marginTop: theme.spacing[2] },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  chipSoon: { backgroundColor: theme.colors.warningLight },
  chipOverdue: { backgroundColor: theme.colors.dangerLight },
  chipText: { ...theme.textStyles.caption, color: theme.colors.textPrimary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  empty: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },
  row: { paddingVertical: theme.spacing[2] },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: theme.spacing[3] },
  rowLabel: { ...theme.textStyles.body, color: theme.colors.textSecondary, flexShrink: 1 },
  rowValue: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, fontVariant: ['tabular-nums' as const] },
  rowStatus: { ...theme.textStyles.caption, marginTop: theme.spacing[0.5] },
});
