import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Vehicle, VehicleCostKind } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

const KINDS: VehicleCostKind[] = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'];

interface Props {
  vehicles: Vehicle[];
  count: number;
  onConfirm: (vehicleId: string, kind: VehicleCostKind) => void;
  onClose: () => void;
}

/**
 * The body of the bulk "Assign to vehicle" picker (ABA-805): which vehicle and
 * which kind of cost every selected expense is. Chrome-free like
 * `BulkChildPickerSheet` — the phone wraps it in its bottom sheet, the desktop
 * in its centred panel.
 */
export function BulkVehiclePickerSheet({ vehicles, count, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [vehicleId, setVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);
  const [kind, setKind] = useState<VehicleCostKind>('fuel');

  const chip = (selected: boolean) => [styles.chip, selected && styles.chipSelected];
  const chipText = (selected: boolean) => [styles.chipText, selected && styles.chipTextSelected];

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{t('vehicles.bulkAssign')}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.note}>{t('vehicles.bulkAssignNote')}</Text>

      {vehicles.length > 1 && (
        <View style={styles.chips}>
          {vehicles.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={chip(vehicleId === v.id)}
              onPress={() => setVehicleId(v.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: vehicleId === v.id }}
            >
              <Text style={chipText(vehicleId === v.id)}>{v.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.chips}>
        {KINDS.map((k) => (
          <TouchableOpacity
            key={k}
            style={chip(kind === k)}
            onPress={() => setKind(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
          >
            <Text style={chipText(kind === k)}>{t(`vehicles.kind_${k}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.confirm, !vehicleId && styles.confirmDisabled]}
        disabled={!vehicleId}
        onPress={() => vehicleId && onConfirm(vehicleId, kind)}
        accessibilityRole="button"
      >
        <Text style={styles.confirmText}>{t('vehicles.bulkAssignConfirm', { count })}</Text>
      </TouchableOpacity>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  cancel: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  note: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[3] },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2], marginBottom: theme.spacing[3] },
  chip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  chipTextSelected: { color: theme.colors.textInverse },
  confirm: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing[2],
  },
  confirmDisabled: { opacity: 0.6 },
  confirmText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
