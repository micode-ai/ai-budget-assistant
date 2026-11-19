import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { filterItems, kindRows } from '@/features/vehicles/vehicleDetailDisplay';
import { fuelUnitKey } from '@/features/vehicles/vehicleDisplay';
import { latestOdometer } from '@/features/vehicles/vehicleRenewals';
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
} from '../VehicleDetailParts';
import type { VehicleDetailLayoutProps } from '../VehicleDetailPhone';
import { VehicleRenewalChips, VehicleRenewalsCard } from '../VehicleRenewals';

/** The rail's width beside the focus column (the dashboard pattern). */
const RAIL_WIDTH = 320;

/**
 * The vehicle screen at >= 1024 (ABA-811), in the Child costs screen's shape:
 * a "Vehicles" breadcrumb, the name with the period chips, four tiles, then a
 * focus column (costs by month, consumption, every cost) beside a rail with the
 * breakdown by kind. Below 1440 the rail drops under the focus column. One
 * page scroll. Presentational: `detail` comes from `VehicleDetailView`.
 */
export function VehicleDetailDesktop({ detail }: VehicleDetailLayoutProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const sideBySide = width >= FACET_RAIL_MIN_WIDTH;
  const { vehicle, history } = detail;
  const unit = t(fuelUnitKey(vehicle?.fuelType ?? 'petrol'));
  const tiles = useVehicleTiles(history, unit);

  if (detail.notFound || (detail.error && !history) || !history || !vehicle) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
        <Breadcrumb />
        <VehicleDetailStatus
          kind={detail.notFound ? 'notFound' : detail.error ? 'error' : 'loading'}
          onRetry={detail.retry}
        />
      </ScrollView>
    );
  }

  const rows = kindRows(history, detail.month);
  const items = filterItems(history.items, detail.month, detail.kind);
  const odometerKm = latestOdometer(history);
  const renewals = <VehicleRenewalsCard vehicle={vehicle} latestOdometerKm={odometerKm} />;

  const breakdown = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('vehicles.byKind')}</Text>
      <KindBreakdown rows={rows} currency={history.currencyCode} kind={detail.kind} onSelectKind={detail.setKind} />
    </View>
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <Breadcrumb />
      <View style={styles.headerRow}>
        <View style={styles.heading}>
          <Ionicons name="car-outline" size={26} color={theme.colors.primary} />
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
            {vehicle.name}
          </Text>
          <Text style={styles.sub}>{t(`vehicles.fuel_${vehicle.fuelType}`)}</Text>
        </View>
        <PeriodChips period={detail.period} onChange={detail.setPeriod} />
      </View>
      <VehicleRenewalChips vehicle={vehicle} latestOdometerKm={odometerKm} />

      <View style={[styles.tiles, detail.loading && styles.stale]}>
        {tiles.map((tile) => (
          <SummaryTile key={tile.key} label={tile.label}>
            <Text style={styles.tileValue}>{tile.value}</Text>
            {!!tile.sub && <Text style={styles.tileSub}>{tile.sub}</Text>}
          </SummaryTile>
        ))}
      </View>

      {history.fxApproximate && <VehicleFxNotice />}

      <View style={[styles.columns, !sideBySide && styles.columnsStacked]}>
        <View style={styles.focus}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('vehicles.byMonth')}</Text>
            <VehicleMonthBars history={history} month={detail.month} onSelect={detail.setMonth} />
          </View>
          {detail.month && <MonthFilterBar month={detail.month} onClear={() => detail.setMonth(null)} />}
          {!sideBySide && breakdown}
          {!sideBySide && renewals}
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
        </View>
        {sideBySide && (
          <View style={styles.rail}>
            {breakdown}
            {renewals}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Breadcrumb() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => router.push('/settings/vehicles')}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      style={styles.breadcrumb}
    >
      <Text style={[styles.breadcrumbText, hovered && styles.breadcrumbHover]}>{t('vehicles.title')}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  page: { padding: theme.spacing[6], gap: theme.spacing[4] },
  breadcrumb: { alignSelf: 'flex-start' as const },
  breadcrumbText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  breadcrumbHover: { textDecorationLine: 'underline' as const },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  heading: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: theme.spacing[2], flexShrink: 1 },
  name: { ...theme.textStyles.h2, color: theme.colors.textPrimary, flexShrink: 1 },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[4] },
  stale: { opacity: 0.6 },
  tileValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  tileSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },
  columns: { flexDirection: 'row' as const, gap: theme.spacing[4], alignItems: 'flex-start' as const },
  columnsStacked: { flexDirection: 'column' as const, alignItems: 'stretch' as const },
  focus: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: theme.spacing[4] },
  rail: { width: RAIL_WIDTH, flexShrink: 0, gap: theme.spacing[4] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
