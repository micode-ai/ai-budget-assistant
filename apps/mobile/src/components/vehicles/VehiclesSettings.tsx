import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { FuelLogWithExpense, FuelType, Vehicle, VehicleStats } from '@budget/shared-types';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { SettingsScreenScroll } from '@/components/settings/SettingsScreenScroll';
import { MoveToAccountPicker } from '@/components/settings/MoveToAccountPicker';
import { useAccountStore } from '@/stores/accountStore';
import { useVehicles, reloadVehicles, forgetVehicles } from '@/features/vehicles/useVehicles';
import { formatConsumption, formatKm, fuelUnitKey, hasConsumption, parseDay } from '@/features/vehicles/vehicleDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

const SHEET_TITLE_ID = 'vehicle-sheet-title';
const NAME_MAX = 60;
const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'lpg', 'electric', 'hybrid', 'other'];

/**
 * Settings → Vehicles (ABA-796): what the car costs in fuel. One card per
 * vehicle with consumption, cost per km and per 100 km in the display
 * currency, and its fill-ups on demand. Fill-ups themselves are entered on
 * the fuel expense (the expense screen's Fill-up section), so this screen only
 * adds, renames, retypes and removes vehicles.
 *
 * Online only (no SQLite mirror): a failed load shows a retry, never "no
 * vehicles". Viewers see the cards with no write affordance. Lives under
 * `src/` so the desktop settings shell can host it as a pane.
 */
export function VehiclesSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  // Vehicles belong to an account; say which one (ABA-800).
  const accountName = useAccountStore((s) => s.currentAccount()?.name ?? '');
  const { accountId, vehicles, isLoaded, isLoading, loadFailed, reload } = useVehicles({ refresh: true });

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [name, setName] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('petrol');
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setFuelType('petrol');
    setSheetVisible(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setName(v.name);
    setFuelType(v.fuelType);
    setSheetVisible(true);
  };
  const close = () => {
    setSheetVisible(false);
    setEditing(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || !accountId) return;
    setIsSaving(true);
    try {
      if (editing) await api.updateVehicle(editing.id, { name: trimmed, fuelType });
      else await api.createVehicle({ name: trimmed, fuelType });
      await reloadVehicles(accountId);
      close();
    } catch (e) {
      console.warn('[vehicles] save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('vehicles.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = (v: Vehicle) => {
    showAlert(t('vehicles.deleteTitle', { name: v.name }), t('vehicles.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteVehicle(v.id);
            if (accountId) await reloadVehicles(accountId);
            close();
          } catch (e) {
            console.warn('[vehicles] delete failed:', e instanceof Error ? e.message : String(e));
            showAlert(t('common.error'), t('vehicles.saveFailed'));
          }
        },
      },
    ]);
  };

  const move = async (v: Vehicle, targetId: string, targetName: string) => {
    try {
      await api.moveVehicle(v.id, targetId);
      if (accountId) await reloadVehicles(accountId);
      // The target's cached list (if any) is stale now.
      forgetVehicles(targetId);
      close();
      showAlert(t('moveToAccount.doneTitle'), t('moveToAccount.done', { name: v.name, account: targetName }));
    } catch (e) {
      const code = (e as { code?: string }).code;
      const status = (e as { status?: number }).status;
      console.warn('[vehicles] move failed:', e instanceof Error ? e.message : String(e));
      showAlert(
        t('common.error'),
        code === 'VEHICLE_IN_USE' || status === 409 ? t('moveToAccount.vehicleInUse') : t('vehicles.saveFailed'),
      );
    }
  };

  let body: React.ReactNode;
  if (loadFailed) {
    body = (
      <View style={[styles.card, styles.stateBox]}>
        <Text style={styles.empty}>{t('vehicles.loadFailed')}</Text>
        <TouchableOpacity onPress={() => void reload()} accessibilityRole="button">
          <Text style={styles.link}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!isLoaded && isLoading) {
    body = (
      <View style={[styles.card, styles.stateBox]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  } else if (vehicles.length === 0) {
    body = (
      <View style={styles.card}>
        <Text style={styles.empty}>{t('vehicles.empty')}</Text>
      </View>
    );
  } else {
    body = vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} canEdit={canEdit} onEdit={() => openEdit(v)} />);
  }

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('vehicles.title')}</Text>
          {canEdit && !loadFailed && (
            <TouchableOpacity onPress={openCreate} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('vehicles.add')}>
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {!!accountName && <Text style={styles.accountNote}>{t('vehicles.accountNote', { account: accountName })}</Text>}
        {body}
        <Text style={styles.hint}>{t('vehicles.hint')}</Text>
      </SettingsScreenScroll>

      <SheetDialog
        visible={sheetVisible}
        onClose={close}
        titleId={SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={SHEET_TITLE_ID} style={styles.modalTitle}>
          {editing ? t('vehicles.edit') : t('vehicles.add')}
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('vehicles.namePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          maxLength={NAME_MAX}
        />
        <Text style={styles.fieldLabel}>{t('vehicles.fuelType')}</Text>
        <View style={styles.chips}>
          {FUEL_TYPES.map((ft) => (
            <TouchableOpacity
              key={ft}
              style={[styles.chip, fuelType === ft && styles.chipSelected]}
              onPress={() => setFuelType(ft)}
              accessibilityRole="radio"
              accessibilityState={{ selected: fuelType === ft }}
            >
              <Text style={[styles.chipText, fuelType === ft && styles.chipTextSelected]}>{t(`vehicles.fuel_${ft}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={close}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || !name.trim()) && styles.saveButtonDisabled]}
            onPress={save}
            disabled={isSaving || !name.trim()}
          >
            <Text style={styles.saveText}>{editing ? t('common.save') : t('vehicles.add')}</Text>
          </TouchableOpacity>
        </View>
        {editing && (
          <MoveToAccountPicker itemName={editing.name} onMove={(id, name) => move(editing, id, name)} />
        )}
        {editing && (
          <TouchableOpacity style={styles.deleteRow} onPress={() => remove(editing)} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t('vehicles.delete')}</Text>
          </TouchableOpacity>
        )}
      </SheetDialog>
    </>
  );
}

function VehicleCard({ vehicle, canEdit, onEdit }: { vehicle: Vehicle; canEdit: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<FuelLogWithExpense[] | null>(null);
  const unit = t(fuelUnitKey(vehicle.fuelType));

  useEffect(() => {
    let cancelled = false;
    setStatsFailed(false);
    api
      .getVehicleStats(vehicle.id)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Vehicle stats unavailable', err);
        if (!cancelled) setStatsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id, vehicle.updatedAt]);

  const toggleLogs = () => {
    const next = !logsOpen;
    setLogsOpen(next);
    if (next && logs === null) {
      api
        .getVehicleFuelLogs(vehicle.id)
        .then(setLogs)
        .catch((err) => {
          console.warn('Fuel logs unavailable', err);
          setLogs([]);
        });
    }
  };

  const currency = stats?.currencyCode ?? 'USD';
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const money = (v: number | null) => (v !== null ? formatCurrency(v, currency) : '—');

  const metaParts: string[] = [];
  if (stats) {
    metaParts.push(t('vehicles.fillUpsCount', { count: stats.fillUps }));
    if (stats.totalKm > 0) metaParts.push(t('vehicles.distance', { km: formatKm(stats.totalKm, locale) }));
    if (stats.fxApproximate) metaParts.push(t('vehicles.fxApprox'));
  }

  let statsBody: React.ReactNode;
  if (statsFailed) statsBody = <Text style={styles.empty}>{t('vehicles.loadFailed')}</Text>;
  else if (!stats) statsBody = <ActivityIndicator color={theme.colors.primary} style={styles.statsLoading} />;
  else if (hasConsumption(stats)) {
    statsBody = (
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatConsumption(stats.consumptionLPer100Km, locale)}</Text>
          <Text style={styles.statLabel}>{t('vehicles.per100', { unit })}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{money(stats.costPer100Km)}</Text>
          <Text style={styles.statLabel}>{t('vehicles.costPer100')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{money(stats.costPerKm)}</Text>
          <Text style={styles.statLabel}>{t('vehicles.costPerKm')}</Text>
        </View>
      </View>
    );
  } else statsBody = <Text style={styles.notEnough}>{t('vehicles.notEnough')}</Text>;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="car-outline" size={20} color={theme.colors.primary} />
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text style={styles.cardSub}>{t(`vehicles.fuel_${vehicle.fuelType}`)}</Text>
        </View>
        {canEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('vehicles.edit')}>
            <Ionicons name="create-outline" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {statsBody}
      {metaParts.length > 0 && <Text style={styles.meta}>{metaParts.join(' · ')}</Text>}

      {stats && stats.fillUps > 0 && (
        <TouchableOpacity
          onPress={toggleLogs}
          style={styles.logsToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: logsOpen }}
        >
          <Text style={styles.link}>{logsOpen ? t('vehicles.hideFillUps') : t('vehicles.showFillUps')}</Text>
          <Ionicons name={logsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      )}

      {logsOpen && logs === null && <ActivityIndicator color={theme.colors.primary} style={styles.statsLoading} />}
      {logsOpen &&
        logs !== null &&
        logs.map((l) => {
          const parts = [
            `${Number(l.liters).toLocaleString(locale)} ${unit}`,
            `${formatKm(l.odometerKm, locale)} km`,
            ...(l.isFullTank ? [] : [t('vehicles.partial')]),
          ];
          return (
            <View key={l.id} style={styles.logRow}>
              <Text style={styles.logDate}>{dayFormat.format(parseDay(l.expense.date))}</Text>
              <Text style={styles.logMain} numberOfLines={1}>
                {parts.join(' · ')}
              </Text>
              <Text style={styles.logAmount}>{formatCurrency(Number(l.expense.amount), l.expense.currencyCode)}</Text>
            </View>
          );
        })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardTitle: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  cardSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  statsRow: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[3] },
  stat: { flex: 1, minWidth: 0 },
  statValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  statLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  statsLoading: { marginTop: theme.spacing[3] },
  notEnough: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[3] },
  meta: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  logsToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: theme.spacing[2] },
  logRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  logDate: { ...theme.textStyles.caption, color: theme.colors.textSecondary, width: 96 },
  logMain: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  logAmount: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, fontVariant: ['tabular-nums' as const] },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  stateBox: { alignItems: 'center' as const, gap: theme.spacing[2] },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  accountNote: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  fieldLabel: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[6],
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
