import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { VehicleDetailState } from '@/features/vehicles/useVehicleDetail';
import { filterItems, kindRows } from '@/features/vehicles/vehicleDetailDisplay';
import { fuelUnitKey } from '@/features/vehicles/vehicleDisplay';
import { latestOdometer } from '@/features/vehicles/vehicleRenewals';
import { VehicleRenewalChips, VehicleRenewalsCard } from './VehicleRenewals';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  ConsumptionChart,
  KindBreakdown,
  MonthFilterBar,
  PeriodChips,
  VehicleDetailStatus,
  VehicleFxNotice,
  VehicleItemList,
  VehicleMonthBars,
  useVehicleTiles,
} from './VehicleDetailParts';

export interface VehicleDetailLayoutProps {
  /** From `useVehicleDetail`, called once in `VehicleDetailView` above the 1024 split. */
  detail: VehicleDetailState;
}

/**
 * The phone (and narrow web) vehicle screen (ABA-811): period chips, four
 * tiles, costs by month, by kind, consumption, then every cost. Presentational.
 */
export function VehicleDetailPhone({ detail }: VehicleDetailLayoutProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { vehicle, history } = detail;
  const unit = t(fuelUnitKey(vehicle?.fuelType ?? 'petrol'));
  const tiles = useVehicleTiles(history, unit);

  let body: React.ReactNode;
  if (detail.notFound) body = <VehicleDetailStatus kind="notFound" />;
  else if (detail.error && !history) body = <VehicleDetailStatus kind="error" onRetry={detail.retry} />;
  else if (!history || !vehicle) body = <VehicleDetailStatus kind="loading" />;
  else {
    const rows = kindRows(history, detail.month);
    const items = filterItems(history.items, detail.month, detail.kind);
    body = (
      <>
        <View style={styles.heading}>
          <Ionicons name="car-outline" size={22} color={theme.colors.primary} />
          <View style={styles.headingText}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {vehicle.name}
            </Text>
            <Text style={styles.sub}>{t(`vehicles.fuel_${vehicle.fuelType}`)}</Text>
            <VehicleRenewalChips vehicle={vehicle} latestOdometerKm={latestOdometer(history)} />
          </View>
        </View>

        <PeriodChips period={detail.period} onChange={detail.setPeriod} />

        <View style={[styles.tiles, detail.loading && styles.stale]}>
          {tiles.map((tile) => (
            <View key={tile.key} style={styles.tile}>
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {tile.value}
              </Text>
              {!!tile.sub && <Text style={styles.tileSub}>{tile.sub}</Text>}
            </View>
          ))}
        </View>

        {history.fxApproximate && <VehicleFxNotice />}

        <VehicleRenewalsCard vehicle={vehicle} latestOdometerKm={latestOdometer(history)} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('vehicles.byMonth')}</Text>
          <VehicleMonthBars history={history} month={detail.month} onSelect={detail.setMonth} />
        </View>

        {detail.month && <MonthFilterBar month={detail.month} onClear={() => detail.setMonth(null)} />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('vehicles.byKind')}</Text>
          <KindBreakdown rows={rows} currency={history.currencyCode} kind={detail.kind} onSelectKind={detail.setKind} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('vehicles.consumptionTitle', { unit })}</Text>
          <ConsumptionChart history={history} unit={t('vehicles.per100', { unit })} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {detail.kind ? `${t('vehicles.itemsTitle')} · ${t(`vehicles.kind_${detail.kind}`)}` : t('vehicles.itemsTitle')}
          </Text>
          <VehicleItemList items={items} unit={unit} />
        </View>
      </>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[8] + insets.bottom }]}
    >
      {body}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[4] },
  heading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  headingText: { flex: 1, minWidth: 0 },
  name: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  stale: { opacity: 0.6 },
  tile: {
    flexBasis: '45%' as const,
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  tileLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[1] },
  tileValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  tileSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[0.5] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
