import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Vehicle, VehicleStats } from '@budget/shared-types';
import { api } from '@/services/api';
import { useTheme, useStyles, type Theme } from '@/theme';

/** The kinds a row names, in order; the two largest are shown under the vehicle. */
const KINDS = ['fuel', 'service', 'insurance', 'parking', 'tax', 'other'];

interface Props {
  /** The account's vehicles; the caller renders nothing when this is empty. */
  vehicles: Vehicle[];
  /** `section` (phone): an h3 title above a card. `card` (desktop `BreakdownGrid` tile): the title inside. */
  variant: 'section' | 'card';
}

/**
 * The Analytics "Vehicles" entry (ABA-806): each vehicle of the account with
 * its cost over the last 12 months, per month, and its two largest kinds,
 * linking to Settings → Vehicles for the detail. A figure still loading or
 * unavailable reads "—", never 0. Mirrors `ChildrenAnalyticsCard`.
 */
export function VehiclesAnalyticsCard({ vehicles, variant }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const list = (
    <View style={styles.surface}>
      {variant === 'card' && <Text style={styles.cardTitle}>{t('vehicles.analyticsTitle')}</Text>}
      <View style={styles.captionRow}>
        <Text style={styles.caption}>{t('vehicles.last12Months')}</Text>
        <Pressable onPress={() => router.push('/settings/vehicles')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.allLink}>{t('vehicles.allVehicles')}</Text>
        </Pressable>
      </View>
      {vehicles.map((v, i) => (
        <VehicleRow key={v.id} vehicle={v} first={i === 0} />
      ))}
    </View>
  );
  if (variant === 'card') return list;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('vehicles.analyticsTitle')}</Text>
      {list}
    </View>
  );
}

function VehicleRow({ vehicle, first }: { vehicle: Vehicle; first: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getVehicleStats(vehicle.id)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Vehicle stats unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id, vehicle.updatedAt]);

  const own = stats?.ownership;
  const currency = stats?.currencyCode ?? 'USD';
  const total = own ? formatCurrency(own.total, currency) : '—';
  const top = own
    ? KINDS.filter((k) => (own.byKind[k] ?? 0) > 0)
        .sort((a, b) => (own.byKind[b] ?? 0) - (own.byKind[a] ?? 0))
        .slice(0, 2)
        .map((k) => `${t(`vehicles.kind_${k}`)} ${formatCurrency(own.byKind[k], currency)}`)
        .join(' · ')
    : '';
  const sub = own && own.total > 0 ? `${t('vehicles.perMonthShort', { amount: formatCurrency(own.perMonth, currency) })}${top ? ` · ${top}` : ''}` : t('vehicles.noCostsYet');

  return (
    <Pressable
      onPress={() => router.push('/settings/vehicles')}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={`${vehicle.name}, ${t('vehicles.last12Months')}: ${total}`}
      style={[styles.row, !first && styles.rowDivider, hovered && styles.rowHover]}
    >
      <Ionicons name="car-outline" size={18} color={theme.colors.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {vehicle.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={styles.rowAmount}>{total}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[5] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  surface: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  captionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  caption: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  allLink: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 52,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowHover: { backgroundColor: theme.colors.surfaceSecondary },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  rowSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
});
