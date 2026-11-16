import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Expense, FuelLog, VehicleCostKind, VehicleCostLink } from '@budget/shared-types';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { useVehicles } from '@/features/vehicles/useVehicles';
import { formatKm, fuelUnitKey, parseLiters, parseOdometer } from '@/features/vehicles/vehicleDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  expense: Expense;
  canEdit: boolean;
}

const SHEET_TITLE_ID = 'fuel-sheet-title';
/** `fuel` is a fill-up (litres, odometer); the rest are other car costs (ABA-803). */
type Kind = 'fuel' | VehicleCostKind;
const KINDS: Kind[] = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'];

/**
 * The expense screen's Fill-up section (ABA-796): litres, odometer and the
 * full-tank flag that turn a fuel expense into data for Settings → Vehicles.
 *
 * Drawn only when the account has a vehicle (or this expense already carries
 * a fill-up), so nobody without a car sees it. Online only — the fuel log has
 * no SQLite mirror; an expense the server has not received yet cannot carry
 * one, and saving says so. The server resolves the device id or the PK.
 */
export function FuelSection({ expense, canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const { vehicles } = useVehicles();
  const expenseId = expense.serverId ?? expense.id;

  const [fuelLog, setFuelLog] = useState<FuelLog | null>(null);
  const [cost, setCost] = useState<VehicleCostLink | null>(null);
  const [kind, setKind] = useState<Kind>('fuel');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [liters, setLiters] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFuelLog(null);
    setCost(null);
    api
      .getExpenseFuelLog(expenseId)
      .then((r) => {
        if (cancelled) return;
        setFuelLog(r.fuelLog);
        setCost(r.cost ?? null);
      })
      .catch((err) => {
        // Offline, or an expense the server has not seen yet: no fill-up to show.
        console.warn('Fuel log unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (vehicles.length === 0 && !fuelLog && !cost) return null;
  if (!fuelLog && !cost && !canEdit) return null;

  const linkedVehicleId = fuelLog?.vehicleId ?? cost?.vehicleId;
  const vehicle = linkedVehicleId ? vehicles.find((v) => v.id === linkedVehicleId) : undefined;
  const unit = t(fuelUnitKey(vehicle?.fuelType ?? 'petrol'));
  const parsedLiters = parseLiters(liters);
  const parsedOdometer = parseOdometer(odometer);
  const canSave =
    !!vehicleId && !isSaving && (kind !== 'fuel' || (parsedLiters !== null && parsedOdometer !== null));

  const open = () => {
    setKind(cost ? cost.kind : 'fuel');
    setVehicleId(linkedVehicleId ?? vehicles[0]?.id ?? null);
    setLiters(fuelLog ? String(Number(fuelLog.liters)) : '');
    setOdometer(fuelLog ? String(fuelLog.odometerKm) : '');
    setFullTank(fuelLog?.isFullTank ?? true);
    setSheetVisible(true);
  };

  const save = async () => {
    if (!canSave || !vehicleId) return;
    setIsSaving(true);
    try {
      if (kind === 'fuel') {
        const saved = await api.upsertFuelLog(vehicleId, expenseId, {
          liters: parsedLiters!,
          odometerKm: parsedOdometer!,
          isFullTank: fullTank,
        });
        setFuelLog(saved);
        setCost(null);
      } else {
        await api.setVehicleCost(vehicleId, expenseId, kind);
        setCost({ vehicleId, kind, source: null });
        setFuelLog(null);
      }
      setSheetVisible(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      console.warn('[fuel] save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), status === 404 ? t('vehicles.notSyncedYet') : t('vehicles.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    try {
      if (fuelLog) await api.removeFuelLog(expenseId);
      else await api.removeVehicleCost(expenseId);
      setFuelLog(null);
      setCost(null);
      setSheetVisible(false);
    } catch (e) {
      console.warn('[fuel] remove failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('vehicles.saveFailed'));
    }
  };

  const summary = cost
    ? [vehicle?.name, t(`vehicles.kind_${cost.kind}`)].filter(Boolean).join(' · ')
    : fuelLog
    ? [
        vehicle?.name,
        `${Number(fuelLog.liters).toLocaleString(locale)} ${unit}`,
        `${formatKm(fuelLog.odometerKm, locale)} km`,
        fuelLog.isFullTank ? t('vehicles.fullTank') : t('vehicles.partial'),
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="speedometer-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.title}>{t('vehicles.carSection')}</Text>
      </View>
      {summary ? (
        <TouchableOpacity activeOpacity={canEdit ? 0.7 : 1} onPress={canEdit ? open : undefined}>
          <Text style={styles.summary}>{summary}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={open} accessibilityRole="button">
          <Text style={styles.link}>{t('vehicles.markAsCarCost')}</Text>
        </TouchableOpacity>
      )}

      <SheetDialog
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        titleId={SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={SHEET_TITLE_ID} style={styles.modalTitle}>
          {t('vehicles.carSection')}
        </Text>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, kind === k && styles.chipSelected]}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextSelected]}>{t(`vehicles.kind_${k}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {vehicles.length > 1 && (
          <View style={styles.chips}>
            {vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.chip, vehicleId === v.id && styles.chipSelected]}
                onPress={() => setVehicleId(v.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: vehicleId === v.id }}
              >
                <Text style={[styles.chipText, vehicleId === v.id && styles.chipTextSelected]}>{v.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {kind === 'fuel' && (
          <>
        <Text style={styles.fieldLabel}>
          {t('vehicles.amountLabel', {
            unit: t(fuelUnitKey(vehicles.find((v) => v.id === vehicleId)?.fuelType ?? 'petrol')),
          })}
        </Text>
        <TextInput
          style={styles.input}
          value={liters}
          onChangeText={setLiters}
          keyboardType="decimal-pad"
          placeholder="40,5"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <Text style={styles.fieldLabel}>{t('vehicles.odometer')}</Text>
        <TextInput
          style={styles.input}
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>{t('vehicles.fullTank')}</Text>
            <Text style={styles.switchHint}>{t('vehicles.fullTankHint')}</Text>
          </View>
          <Switch
            value={fullTank}
            onValueChange={setFullTank}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            accessibilityLabel={t('vehicles.fullTank')}
          />
        </View>
          </>
        )}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setSheetVisible(false)}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={styles.saveText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
        {(fuelLog || cost) && (
          <TouchableOpacity style={styles.deleteRow} onPress={remove} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t('vehicles.removeCarCost')}</Text>
          </TouchableOpacity>
        )}
      </SheetDialog>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  summary: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  fieldLabel: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
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
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[6],
  },
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  switchHint: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  deleteRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  deleteText: { ...theme.textStyles.bodyMedium, color: theme.colors.danger },
});
